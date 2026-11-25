package cc.agentlabs.opencode

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.os.StatFs
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import java.io.File
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Local, private GGUF storage and one native inference at a time.
 * No external app, shell, dynamic executable or remotely supplied model code. */
class LocalModelModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
    private val worker = Executors.newSingleThreadExecutor()
    private val busy = AtomicBoolean(false)
    private val cancelled = AtomicBoolean(false)
    @Volatile private var transferred = 0L
    @Volatile private var expected = 0L
    @Volatile private var operation = ""
    @Volatile private var connection: HttpURLConnection? = null
    private val root get() = File(ctx.filesDir, "agentlink-gguf").apply { mkdirs() }
    private val engine = try { System.loadLibrary("agentlink_local"); nativeAvailable() } catch (_: Throwable) { false }

    private external fun nativeAvailable(): Boolean
    private external fun nativeReset()
    private external fun nativeCancel()
    private external fun nativeGenerate(file: ByteArray, input: ByteArray, context: Int, threads: Int, limit: Int): Array<ByteArray>
    override fun getName() = "AgentLinkLocalModels"

    private fun key(hash: String): String {
        require(hash.matches(Regex("[a-fA-F0-9]{64}"))) { "Invalid model checksum" }
        return hash.lowercase() + ".gguf"
    }
    private fun file(hash: String) = File(root, key(hash))
    private fun part(hash: String) = File(root, key(hash) + ".part")
    private fun memory(): ActivityManager.MemoryInfo {
        val info = ActivityManager.MemoryInfo()
        (ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(info)
        return info
    }
    private fun thermal(): Int =
        if (Build.VERSION.SDK_INT >= 29) (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).currentThermalStatus else -1

    @ReactMethod fun stats(promise: Promise) {
        try {
            val m = memory()
            val map = Arguments.createMap()
            map.putBoolean("engine", engine)
            map.putDouble("availableRamBytes", m.availMem.toDouble())
            map.putDouble("totalRamBytes", m.totalMem.toDouble())
            map.putDouble("freeStorageBytes", StatFs(root.absolutePath).availableBytes.toDouble())
            map.putInt("cores", Runtime.getRuntime().availableProcessors())
            map.putString("abi", Build.SUPPORTED_ABIS.firstOrNull() ?: "")
            map.putString("soc", if (Build.VERSION.SDK_INT >= 31) Build.SOC_MODEL else Build.HARDWARE)
            map.putInt("thermal", thermal())
            promise.resolve(map)
        } catch (e: Exception) { promise.reject("stats", e) }
    }
    @ReactMethod fun progress(promise: Promise) {
        val map = Arguments.createMap()
        map.putBoolean("busy", busy.get())
        map.putString("operation", operation)
        map.putDouble("bytes", transferred.toDouble())
        map.putDouble("total", expected.toDouble())
        promise.resolve(map)
    }
    @ReactMethod fun cancel(promise: Promise) {
        cancelled.set(true)
        connection?.disconnect()
        if (engine) nativeCancel()
        promise.resolve(null)
    }
    private fun checkCancelled() { check(!cancelled.get()) { "Cancelled" } }
    private fun task(name: String, promise: Promise, block: () -> Any?) {
        if (!busy.compareAndSet(false, true)) { promise.reject("busy", "Another local operation is running"); return }
        cancelled.set(false)
        if (engine) nativeReset()
        operation = name; transferred = 0; expected = 0
        worker.execute {
            try { promise.resolve(block()) }
            catch (e: Throwable) { promise.reject(if (cancelled.get()) "cancelled" else "local_model", if (cancelled.get()) "Cancelled" else (e.message ?: "Local operation failed")) }
            finally { connection?.disconnect(); connection = null; operation = ""; busy.set(false) }
        }
    }
    private fun digest(file: File): String {
        val hash = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered().use { input ->
            val buffer = ByteArray(256 * 1024)
            while (true) { checkCancelled(); val n = input.read(buffer); if (n < 0) break; hash.update(buffer, 0, n) }
        }
        return hash.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
    }
    private fun isGguf(file: File): Boolean = file.inputStream().use {
        val b = ByteArray(4)
        it.read(b) == 4 && b.contentEquals(byteArrayOf(71, 71, 85, 70))
    }
    private fun trusted(url: URL): Boolean {
        val host = url.host.lowercase()
        return url.protocol == "https" && url.userInfo == null && (url.port == -1 || url.port == 443) &&
            (host == "huggingface.co" || host.endsWith(".huggingface.co") || host.endsWith(".hf.co"))
    }
    private fun source(repo: String, revision: String, name: String): URL {
        require(repo.matches(Regex("[A-Za-z0-9][A-Za-z0-9_.-]{0,95}/[A-Za-z0-9][A-Za-z0-9_.-]{0,95}"))) { "Invalid repository" }
        require(revision.matches(Regex("[a-fA-F0-9]{40}"))) { "Invalid revision" }
        require(name.matches(Regex("[A-Za-z0-9][A-Za-z0-9_.-]{0,199}\\.gguf", RegexOption.IGNORE_CASE)) &&
            !name.matches(Regex(".*-\\d{5}-of-\\d{5}\\.gguf", RegexOption.IGNORE_CASE))) { "Only single-file GGUF models are supported" }
        return URL("https://huggingface.co/$repo/resolve/$revision/$name")
    }
    private fun open(url: URL, offset: Long): HttpURLConnection {
        var next = url
        repeat(8) {
            checkCancelled()
            require(trusted(next)) { "Untrusted model download destination" }
            val conn = next.openConnection() as HttpURLConnection
            connection = conn
            conn.instanceFollowRedirects = false; conn.connectTimeout = 20000; conn.readTimeout = 30000
            conn.setRequestProperty("Accept-Encoding", "identity")
            if (offset > 0) conn.setRequestProperty("Range", "bytes=$offset-")
            val status = conn.responseCode
            if (status in listOf(301,302,303,307,308)) {
                val location = conn.getHeaderField("Location") ?: throw IllegalStateException("Invalid model redirect")
                next = URL(next, location); conn.disconnect()
            } else return conn
        }
        throw IllegalStateException("Too many redirects")
    }

    @ReactMethod fun download(repo: String, revision: String, name: String, hash: String, size: Double, promise: Promise) =
        task("download", promise) {
            require(size.isFinite() && size > 0 && size <= 64.0 * 1024 * 1024 * 1024 && size == size.toLong().toDouble()) { "Invalid model size" }
            val url = source(repo, revision, name)
            val dest = file(hash); val tmp = part(hash); val total = size.toLong()
            expected = total
            if (dest.isFile && dest.length() == total && isGguf(dest) && digest(dest).equals(hash, true)) {
                transferred = total; return@task dest.absolutePath
            }
            if (tmp.length() > total) check(tmp.delete()) { "Cannot reset partial download" }
            var offset = tmp.length()
            if (StatFs(root.absolutePath).availableBytes < total - offset + 128L * 1024 * 1024) throw IllegalStateException("Insufficient free storage")
            transferred = offset
            if (offset < total) {
                val conn = open(url, offset)
                val status = conn.responseCode
                if (status == 200) offset = 0
                else if (status == 206) {
                    val range = conn.getHeaderField("Content-Range") ?: ""
                    val match = Regex("bytes (\\d+)-(\\d+)/(\\d+)").matchEntire(range)
                    check(match != null && match.groupValues[1].toLong() == offset && match.groupValues[3].toLong() == total && match.groupValues[2].toLong() == total - 1) { "Invalid resumed response" }
                } else throw IllegalStateException("Download HTTP $status")
                RandomAccessFile(tmp, "rw").use { out ->
                    out.setLength(offset); out.seek(offset); transferred = offset
                    conn.inputStream.buffered().use { input ->
                        val buffer = ByteArray(128 * 1024)
                        while (true) {
                            checkCancelled()
                            val n = input.read(buffer)
                            if (n < 0) break
                            check(transferred + n <= total) { "Download exceeds expected size" }
                            out.write(buffer, 0, n); transferred += n
                        }
                    }
                    out.fd.sync()
                }
                conn.disconnect()
            }
            checkCancelled()
            check(tmp.length() == total) { "Incomplete download; retry to resume" }
            if (!isGguf(tmp) || !digest(tmp).equals(hash, true)) {
                tmp.delete(); throw IllegalStateException("Model format or SHA-256 check failed")
            }
            checkCancelled()
            check(tmp.renameTo(dest)) { "Could not finalize model file" }
            dest.absolutePath
        }
    @ReactMethod fun remove(hash: String, promise: Promise) = task("remove", promise) {
        for (f in listOf(file(hash), part(hash))) if (f.exists()) check(f.delete()) { "Could not delete model" }
        null
    }
    @ReactMethod fun installed(hash: String, promise: Promise) {
        try { promise.resolve(file(hash).isFile) } catch (e: Exception) { promise.reject("invalid_model", e) }
    }
    @ReactMethod fun generate(hash: String, prompt: String, context: Int, threads: Int, limit: Int, promise: Promise) =
        task("generate", promise) {
            check(engine) { "Native model engine unavailable for this ABI" }
            require(prompt.isNotBlank() && prompt.length <= 8000 && !prompt.contains('\u0000')) { "Invalid prompt" }
            require(context in listOf(1024,2048,4096) && threads in 1..8 && limit in 1..512) { "Invalid generation settings" }
            val model = file(hash)
            check(model.isFile && isGguf(model)) { "Download this model first" }
            check(digest(model).equals(hash, true)) { "Model integrity check failed" }
            val mem = memory()
            check(!mem.lowMemory && mem.availMem > model.length() + 768L * 1024 * 1024) { "Insufficient available RAM" }
            check(thermal() < 4) { "Device is too hot" }
            checkCancelled()
            val result = nativeGenerate(model.absolutePath.toByteArray(Charsets.UTF_8), prompt.toByteArray(Charsets.UTF_8), context, threads, limit)
            val map = Arguments.createMap()
            map.putString("text", result[0].toString(Charsets.UTF_8))
            map.putString("metrics", result[1].toString(Charsets.UTF_8))
            map
        }

    override fun invalidate() {
        cancelled.set(true); connection?.disconnect(); if (engine) nativeCancel(); worker.shutdown()
        super.invalidate()
    }
}

class LocalModelPackage : ReactPackage {
    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(LocalModelModule(context))
    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
