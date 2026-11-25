#include <jni.h>
#include <atomic>
#include <algorithm>
#include <stdexcept>
#include <string>
#include <vector>
#include <memory>
#include <mutex>
#include <cmath>
#ifdef AGENTLINK_LLAMA
#include "llama.h"
#endif

namespace {
std::atomic<bool> cancelled{false};
std::string bytes(JNIEnv *env, jbyteArray input) {
    if (!input) throw std::runtime_error("Missing input");
    const auto n = env->GetArrayLength(input);
    std::string result(n, '\0');
    if (n) env->GetByteArrayRegion(input, 0, n, reinterpret_cast<jbyte*>(result.data()));
    return result;
}
jbyteArray to_bytes(JNIEnv *env, const std::string &text) {
    auto value = env->NewByteArray(static_cast<jsize>(text.size()));
    if (value && !text.empty()) env->SetByteArrayRegion(value, 0, static_cast<jsize>(text.size()), reinterpret_cast<const jbyte*>(text.data()));
    return value;
}
void fail(JNIEnv *env, const char *message) {
    env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), message);
}
#ifdef AGENTLINK_LLAMA
std::once_flag backend;
bool abort_decode(void *) { return cancelled.load(); }
bool progress(float, void *) { return !cancelled.load(); }
#endif
}

extern "C" JNIEXPORT jboolean JNICALL
Java_cc_agentlabs_opencode_LocalModelModule_nativeAvailable(JNIEnv *, jobject) {
#ifdef AGENTLINK_LLAMA
    return JNI_TRUE;
#else
    return JNI_FALSE;
#endif
}
extern "C" JNIEXPORT void JNICALL
Java_cc_agentlabs_opencode_LocalModelModule_nativeReset(JNIEnv *, jobject) { cancelled.store(false); }
extern "C" JNIEXPORT void JNICALL
Java_cc_agentlabs_opencode_LocalModelModule_nativeCancel(JNIEnv *, jobject) { cancelled.store(true); }
extern "C" JNIEXPORT jobjectArray JNICALL
Java_cc_agentlabs_opencode_LocalModelModule_nativeGenerate(JNIEnv *env, jobject, jbyteArray file, jbyteArray input, jint context, jint threads, jint limit) {
#ifndef AGENTLINK_LLAMA
    fail(env, "Local inference requires a 64-bit Android build");
    return nullptr;
#else
    try {
        if (context < 1024 || context > 4096 || threads < 1 || threads > 8 || limit < 1 || limit > 512) throw std::runtime_error("Invalid inference parameters");
        std::call_once(backend, [] { llama_backend_init(); });
        const auto path = bytes(env, file);
        const auto user = bytes(env, input);
        if (user.empty() || user.size() > 32000 || user.find('\0') != std::string::npos) throw std::runtime_error("Invalid prompt");
        auto mp = llama_model_default_params();
        mp.n_gpu_layers = 0; mp.use_mmap = true; mp.use_mlock = false; mp.progress_callback = progress;
        std::unique_ptr<llama_model, decltype(&llama_model_free)> model(llama_model_load_from_file(path.c_str(), mp), llama_model_free);
        if (!model || cancelled.load()) throw std::runtime_error("Model load failed or cancelled");
        if (llama_model_has_encoder(model.get())) throw std::runtime_error("Encoder-decoder models are not supported");
        const char *tmpl = llama_model_chat_template(model.get(), nullptr);
        if (!tmpl) throw std::runtime_error("GGUF has no supported chat template");
        llama_chat_message msg{"user", user.c_str()};
        int length = llama_chat_apply_template(tmpl, &msg, 1, true, nullptr, 0);
        if (length <= 0 || length > 1000000) throw std::runtime_error("Unsupported chat template");
        std::vector<char> formatted(length + 1);
        if (llama_chat_apply_template(tmpl, &msg, 1, true, formatted.data(), static_cast<int>(formatted.size())) != length) throw std::runtime_error("Chat template error");
        const auto *vocab = llama_model_get_vocab(model.get());
        int count = -llama_tokenize(vocab, formatted.data(), length, nullptr, 0, true, true);
        if (count <= 0 || count + limit > context) throw std::runtime_error("Prompt exceeds context; reduce prompt or output length");
        std::vector<llama_token> tokens(count);
        if (llama_tokenize(vocab, formatted.data(), length, tokens.data(), count, true, true) != count) throw std::runtime_error("Tokenization failed");
        auto cp = llama_context_default_params();
        cp.n_ctx = context; cp.n_batch = std::min(context, 512); cp.n_ubatch = std::min(context, 128);
        cp.n_threads = threads; cp.n_threads_batch = threads; cp.no_perf = false;
        cp.abort_callback = abort_decode; cp.abort_callback_data = nullptr;
        std::unique_ptr<llama_context, decltype(&llama_free)> ctx(llama_init_from_model(model.get(), cp), llama_free);
        if (!ctx) throw std::runtime_error("Could not allocate context");
        auto sp = llama_sampler_chain_default_params();
        std::unique_ptr<llama_sampler, decltype(&llama_sampler_free)> sampler(llama_sampler_chain_init(sp), llama_sampler_free);
        if (!sampler) throw std::runtime_error("Sampler initialization failed");
        llama_sampler_chain_add(sampler.get(), llama_sampler_init_top_k(40));
        llama_sampler_chain_add(sampler.get(), llama_sampler_init_top_p(0.9f, 1));
        llama_sampler_chain_add(sampler.get(), llama_sampler_init_temp(0.7f));
        llama_sampler_chain_add(sampler.get(), llama_sampler_init_dist(LLAMA_DEFAULT_SEED));
        for (int start = 0; start < count; start += 512) {
            if (cancelled.load()) throw std::runtime_error("Cancelled");
            if (llama_decode(ctx.get(), llama_batch_get_one(tokens.data() + start, std::min(512,count-start)))) throw std::runtime_error("Prompt evaluation failed or cancelled");
        }
        std::string output;
        for (int i = 0; i < limit && !cancelled.load(); ++i) {
            llama_token token = llama_sampler_sample(sampler.get(), ctx.get(), -1);
            if (llama_vocab_is_eog(vocab, token)) break;
            char buf[256];
            int n = llama_token_to_piece(vocab, token, buf, sizeof(buf), 0, false);
            if (n < 0) {
                if (n < -65536) throw std::runtime_error("Invalid token piece");
                std::vector<char> large(-n);
                n = llama_token_to_piece(vocab, token, large.data(), static_cast<int>(large.size()), 0, false);
                if (n < 0) throw std::runtime_error("Token decoding failed");
                output.append(large.data(), n);
            } else output.append(buf, n);
            if (i + 1 < limit && !cancelled.load() && llama_decode(ctx.get(), llama_batch_get_one(&token, 1))) {
                if (cancelled.load()) break;
                throw std::runtime_error("Generation failed");
            }
        }
        const auto perf = llama_perf_context(ctx.get());
        const auto rate = [](int n, double ms) { return n > 0 && ms > 0 && std::isfinite(ms) ? std::to_string(n * 1000.0 / ms) : "null"; };
        std::string meta = "{\"promptPerSecond\":" + rate(perf.n_p_eval, perf.t_p_eval_ms) +
                           ",\"generationPerSecond\":" + rate(perf.n_eval, perf.t_eval_ms) +
                           ",\"cancelled\":" + (cancelled.load() ? "true" : "false") + "}";
        auto result = env->NewObjectArray(2, env->FindClass("[B"), nullptr);
        auto a = to_bytes(env, output), b = to_bytes(env, meta);
        env->SetObjectArrayElement(result, 0, a); env->SetObjectArrayElement(result, 1, b);
        return result;
    } catch (const std::exception &error) { fail(env, error.what()); return nullptr; }
    catch (...) { fail(env, "Native inference failed"); return nullptr; }
#endif
}
