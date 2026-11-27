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
    @Volatile private var partialText = ""
    @Volatile private var connection: HttpURLConnection? = null
    private val root get() = File(ctx.filesDir, "agentlink-gguf").apply { mkdirs() }
    private val engine = try { System.loadLibrary("agentlink_local"); nativeAvailable() } catch (_: Throwable) { false }

    private external fun nativeAvailable(): Boolean
    private external fun nativeBackends(): String
    private external fun nativeReset()
    private external fun nativeCancel()
    private external fun nativeGenerate(file: ByteArray, input: Array<ByteArray>, context: Int, threads: Int, limit: Int, memoryBudget: Long, backendMode: Int): Array<ByteArray>
    @Suppress("unused") private fun nativePreview(bytes: ByteArray) { partialText = bytes.toString(Charsets.UTF_8) }
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

    // Android Keystore key is non-exportable. No plaintext fallback or backup.
    private val vaultLock = Any()
    private fun vaultFile(name: String): android.util.AtomicFile {
        require(name.matches(Regex("[a-z0-9_-]{1,100}"))) { "Invalid vault name" }
        val dir = File(ctx.noBackupFilesDir, "agentlink-vault").apply { mkdirs() }
        return android.util.AtomicFile(File(dir, name + ".bin"))
    }
    private fun vaultKey(create: Boolean): javax.crypto.SecretKey {
        val store = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val alias = "agentlink-local-vault-v1"
        val existing = store.getKey(alias, null) as? javax.crypto.SecretKey
        if (existing != null) return existing
        check(create) { "History encryption key unavailable" }
        val generator = javax.crypto.KeyGenerator.getInstance("AES", "AndroidKeyStore")
        generator.init(android.security.keystore.KeyGenParameterSpec.Builder(alias,
            android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or android.security.keystore.KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).build())
        return generator.generateKey()
    }
    @ReactMethod fun vaultRead(name: String, promise: Promise) {
        try { synchronized(vaultLock) {
            val file = vaultFile(name)
            if (!file.baseFile.exists()) { promise.resolve(null); return@synchronized }
            val data = file.readFully()
            require(data.size in 29..(1024 * 1024 + 64) && data[0] == 1.toByte()) { "Invalid encrypted history" }
            val cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(javax.crypto.Cipher.DECRYPT_MODE, vaultKey(false), javax.crypto.spec.GCMParameterSpec(128, data.copyOfRange(1,13)))
            cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
            promise.resolve(cipher.doFinal(data,13,data.size-13).toString(Charsets.UTF_8))
        } } catch (e: Exception) { promise.reject("vault_read", e) }
    }
    @ReactMethod fun vaultWrite(name: String, value: String, promise: Promise) {
        try { synchronized(vaultLock) {
            val raw = value.toByteArray(Charsets.UTF_8)
            require(raw.size <= 1024*1024) { "History storage limit" }
            val file = vaultFile(name)
            val cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(javax.crypto.Cipher.ENCRYPT_MODE, vaultKey(!file.baseFile.exists()))
            cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
            check(cipher.iv.size == 12)
            val payload = byteArrayOf(1) + cipher.iv + cipher.doFinal(raw)
            val out = file.startWrite()
            try { out.write(payload); file.finishWrite(out) } catch (e: Exception) { file.failWrite(out); throw e }
            promise.resolve(null)
        } } catch (e: Exception) { promise.reject("vault_write", e) }
    }
    @ReactMethod fun vaultRemove(name: String, promise: Promise) {
        try { synchronized(vaultLock) { vaultFile(name).delete(); promise.resolve(null) } }
        catch (e: Exception) { promise.reject("vault_remove", e) }
    }

    @ReactMethod fun stats(promise: Promise) {
        try {
            val m = memory()
            val map = Arguments.createMap()
            map.putBoolean("engine", engine)
            val backends=Arguments.createArray()
            if(engine) nativeBackends().split(",").filter { it.isNotEmpty() }.forEach { backends.pushString(it) }
            map.putArray("backends", backends)
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
        map.putString("text", if (operation == "generate") partialText else "")
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
        operation = name; transferred = 0; expected = 0; partialText = ""
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
        // A selected exit node is mandatory for this entire operation.
        val relay = tsnetbridge.Tsnetbridge.modelRelayURL().orEmpty()
        repeat(8) {
            checkCancelled()
            require(trusted(next)) { "Untrusted model download destination" }
            val transport = if (relay.isEmpty()) next else URL(relay + "?url=" + java.net.URLEncoder.encode(next.toExternalForm(), "UTF-8"))
            val conn = (if (relay.isEmpty()) transport.openConnection() else transport.openConnection(java.net.Proxy.NO_PROXY)) as HttpURLConnection
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

    @ReactMethod fun catalog(url: String, promise: Promise) = task("catalog", promise) {
        val source = URL(url)
        require(trusted(source) && source.host.equals("huggingface.co", true) && (source.path == "/api/models" || source.path.startsWith("/api/models/"))) { "Invalid catalog URL" }
        val conn = open(source, 0)
        try {
            check(conn.responseCode == 200) { "Catalog HTTP " + conn.responseCode }
            val output = java.io.ByteArrayOutputStream()
            conn.inputStream.use { input ->
                val bytes = ByteArray(32768)
                while (true) {
                    checkCancelled()
                    val n = input.read(bytes)
                    if (n < 0) break
                    require(output.size() + n <= 4 * 1024 * 1024) { "Catalog response too large" }
                    output.write(bytes, 0, n)
                }
            }
            output.toString("UTF-8")
        } finally { conn.disconnect() }
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
    @ReactMethod fun generate(hash: String, prompt: String, context: Int, threads: Int, limit: Int, backendMode: Int, promise: Promise) =
        task("generate", promise) {
            check(engine) { "Native model engine unavailable for this ABI" }
            require(prompt.length <= 128000) { "Conversation too large" }
            val json = org.json.JSONArray(prompt)
            require(json.length() in 1..31 && json.length() % 2 == 1) { "Invalid chat turns" }
            val messages = ArrayList<ByteArray>()
            var total = 0
            for (i in 0 until json.length()) {
                val message = json.getJSONObject(i)
                val role = message.getString("role")
                val content = message.getString("content")
                require(role == (if(i % 2 == 0) "user" else "assistant") && content.isNotBlank() && !content.contains('\u0000')) { "Invalid chat message" }
                val data = content.toByteArray(Charsets.UTF_8)
                total += data.size
                require(total <= 32000) { "Conversation exceeds input limit" }
                messages.add(role.toByteArray(Charsets.UTF_8)); messages.add(data)
            }
            val input = messages.toTypedArray()
            require(context in listOf(1024,2048,4096) && threads in 1..8 && limit in 1..512 && backendMode in 0..3) { "Invalid generation settings" }
            val model = file(hash)
            check(model.isFile && isGguf(model)) { "Download this model first" }
            check(digest(model).equals(hash, true)) { "Model integrity check failed" }
            val mem = memory()
            check(!mem.lowMemory && mem.availMem > model.length() + 768L * 1024 * 1024) { "Insufficient available RAM" }
            check(thermal() < 3) { "Device is too hot" }
            checkCancelled()
            val power=ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
            val result = if (Build.VERSION.SDK_INT >= 29) {
                val listener=PowerManager.OnThermalStatusChangedListener { value ->
                    if (value >= PowerManager.THERMAL_STATUS_SEVERE) { cancelled.set(true); nativeCancel() }
                }
                power.addThermalStatusListener(listener)
                try {
                    checkCancelled()
                    nativeGenerate(model.absolutePath.toByteArray(Charsets.UTF_8), input, context, threads, limit, mem.availMem, backendMode)
                } finally { power.removeThermalStatusListener(listener) }
            } else nativeGenerate(model.absolutePath.toByteArray(Charsets.UTF_8), input, context, threads, limit, mem.availMem, backendMode)
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
