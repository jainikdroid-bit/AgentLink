package cc.agentlabs.opencode

import android.app.Activity
import android.content.Intent
import android.util.Base64
import android.provider.OpenableColumns
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.RandomAccessFile
import java.util.UUID
import java.security.MessageDigest
import java.util.concurrent.Executors

/** Explicit document picker; no broad storage permission. Bounded transfer in either direction. */
class RemoteFileModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
    private val max = 4 * 1024 * 1024
    private val worker = Executors.newSingleThreadExecutor()
    private data class Pending(val promise: Promise, val data: ByteArray?, val file: File? = null, val largePick: Boolean = false)
    private data class Download(val id: String, val file: File, val total: Long, val hash: String, var offset: Long = 0)
    private var download: Download? = null
    private var upload: Download? = null
    private val maxDownload = 256L * 1024 * 1024
    private val chunkSize = 512 * 1024
    private fun stagingDir() = File(ctx.cacheDir, "agentlink-remote-downloads").also { it.mkdirs() }
    private fun fileDigest(file: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(65536)
            while (true) { val n = input.read(buf); if (n < 0) break; md.update(buf, 0, n) }
        }
        return md.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
    }
    private fun queue(promise: Promise, job: () -> Any?) {
        try { worker.execute { try { promise.resolve(job()) } catch (e: Exception) { promise.reject("remote_file", e) } } }
        catch (e: Exception) { promise.reject("remote_file", e) }
    }
    private fun validHash(hash: String) = hash.matches(Regex("[0-9a-f]{64}"))
    private fun current(id: String): Download = download?.takeIf { it.id == id } ?: error("Download session unavailable")
    private var pending: Pending? = null
    private val listener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode != 7811 && requestCode != 7812) return
            val job = synchronized(this@RemoteFileModule) { val p = pending; pending = null; p } ?: return
            if (resultCode != Activity.RESULT_OK || data?.data == null) { job.file?.delete(); job.promise.resolve(null); return }
            val uri = data.data!!
            worker.execute {
                try {
                    if (requestCode == 7811 && job.largePick) {
                        require(upload == null) { "Another upload is active" }
                        val name = ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use { cursor -> if(cursor.moveToFirst())cursor.getString(0) else null } ?: "file"
                        val dir = stagingDir()
                        dir.listFiles()?.filter { it.name.startsWith("upload-") && System.currentTimeMillis() - it.lastModified() > 24L * 3600000 }?.forEach { it.delete() }
                        val temp = File.createTempFile("upload-", ".tmp", dir)
                        try {
                            val md = MessageDigest.getInstance("SHA-256")
                            var total = 0L
                            ctx.contentResolver.openInputStream(uri)?.use { input ->
                                temp.outputStream().use { output ->
                                    val buf = ByteArray(65536)
                                    while (true) {
                                        val n = input.read(buf)
                                        if (n < 0) break
                                        total += n
                                        require(total <= maxDownload) { "File exceeds 256 MiB" }
                                        require(dir.usableSpace >= n.toLong() + 8L * 1024 * 1024) { "Not enough free storage" }
                                        output.write(buf, 0, n)
                                        md.update(buf, 0, n)
                                    }
                                }
                            } ?: error("Cannot read document")
                            val id = UUID.randomUUID().toString()
                            val hash = md.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
                            upload = Download(id, temp, total, hash)
                            val result = Arguments.createMap()
                            result.putString("name",name);result.putString("id",id);result.putDouble("bytes",total.toDouble());result.putString("sha256",hash)
                            job.promise.resolve(result)
                        } catch(e: Exception) { temp.delete(); throw e }
                    } else if (requestCode == 7811 && job.data == null && job.file == null) {
                        val out = ByteArrayOutputStream()
                        ctx.contentResolver.openInputStream(uri)?.use { input ->
                            val buf = ByteArray(65536)
                            while (true) { val n = input.read(buf); if (n < 0) break; require(out.size()+n<=max) { "File exceeds 4 MiB" }; out.write(buf,0,n) }
                        } ?: error("Cannot read document")
                        val bytes = out.toByteArray()
                        val name = ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use { cursor -> if(cursor.moveToFirst())cursor.getString(0) else null } ?: "file"
                        val result = Arguments.createMap()
                        result.putString("name",name);result.putString("base64",Base64.encodeToString(bytes,Base64.NO_WRAP));result.putString("sha256",digest(bytes));result.putInt("bytes",bytes.size)
                        job.promise.resolve(result)
                    } else if(requestCode == 7812 && job.file != null) {
                        ctx.contentResolver.openOutputStream(uri,"w")?.use { output -> job.file.inputStream().use { it.copyTo(output, 65536) }; output.flush() } ?: error("Cannot save document")
                        job.promise.resolve(true)
                    } else if(requestCode == 7812 && job.data != null) {
                        ctx.contentResolver.openOutputStream(uri,"w")?.use { it.write(job.data);it.flush() } ?: error("Cannot save document")
                        job.promise.resolve(true)
                    } else error("Unexpected document action")
                } catch(e: Exception) { job.promise.reject("remote_file",e) } finally { job.file?.delete() }
            }
        }
    }
    init { ctx.addActivityEventListener(listener) }
    override fun getName() = "AgentLinkRemoteFiles"
    private fun digest(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) }
    private fun launch(intent: Intent, request: Int, job: Pending) {
        val activity = currentActivity ?: run { job.file?.delete(); job.promise.reject("remote_file","No foreground activity");return }
        synchronized(this) { if(pending!=null){job.file?.delete();job.promise.reject("remote_file","A file picker is already open");return};pending=job }
        activity.runOnUiThread {
            try { activity.startActivityForResult(intent,request) }
            catch(e:Exception){synchronized(this){pending=null};job.file?.delete();job.promise.reject("remote_file",e)}
        }
    }
    @ReactMethod fun pick(promise: Promise) {
        launch(Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"),7811,Pending(promise,null))
    }
    @ReactMethod fun save(name:String,base64:String,sha256:String,promise: Promise) {
        try {
            require(name.length in 1..200 && !name.contains('/') && !name.contains('\\') && !name.any { it.code < 32 })
            require(base64.length <= ((max+2)/3)*4)
            val bytes=Base64.decode(base64,Base64.DEFAULT)
            require(bytes.size<=max && digest(bytes)==sha256) { "File integrity check failed" }
            val intent=Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/octet-stream").putExtra(Intent.EXTRA_TITLE,name)
            launch(intent,7812,Pending(promise,bytes))
        }catch(e:Exception){promise.reject("remote_file",e)}
    }
    @ReactMethod fun pickLarge(promise: Promise) {
        launch(Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"),7811,Pending(promise,null,largePick=true))
    }
    @ReactMethod fun readUploadChunk(id: String, offset: Double, promise: Promise) = queue(promise) {
        val u = upload?.takeIf { it.id == id } ?: error("Upload session unavailable")
        require(offset.isFinite() && offset >= 0 && offset == offset.toLong().toDouble() && offset.toLong() % chunkSize == 0L && offset < u.total)
        require(u.file.length() == u.total) { "Staging file changed" }
        val size = minOf(chunkSize.toLong(), u.total - offset.toLong()).toInt()
        val bytes = ByteArray(size)
        RandomAccessFile(u.file, "r").use { it.seek(offset.toLong()); it.readFully(bytes) }
        Arguments.createMap().apply {
            putString("base64",Base64.encodeToString(bytes,Base64.NO_WRAP))
            putString("sha256",digest(bytes));putInt("bytes",size)
        }
    }
    @ReactMethod fun discardUpload(id: String, promise: Promise) = queue(promise) {
        if(upload?.id == id) { upload?.file?.delete(); upload = null }
        true
    }
    @ReactMethod fun beginDownload(total: Double, hash: String, promise: Promise) = queue(promise) {
        require(total.isFinite() && total >= 0 && total <= maxDownload && total == total.toLong().toDouble() && validHash(hash))
        require(download == null) { "Another download is active" }
        val dir = stagingDir()
        // Clean only abandoned files owned by this module, not any user's selected document.
        dir.listFiles()?.filter { it.name.startsWith("part-") && System.currentTimeMillis() - it.lastModified() > 24L * 3600000 }?.forEach { it.delete() }
        require(dir.usableSpace >= total.toLong() + 8L * 1024 * 1024) { "Not enough free storage" }
        val id = UUID.randomUUID().toString()
        val file = File.createTempFile("part-", ".tmp", dir)
        download = Download(id, file, total.toLong(), hash)
        id
    }
    @ReactMethod fun appendDownload(id: String, offset: Double, base64: String, hash: String, promise: Promise) = queue(promise) {
        val d = current(id)
        require(offset == d.offset.toDouble() && validHash(hash) && base64.length <= ((chunkSize+2)/3)*4)
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        require(bytes.isNotEmpty() && bytes.size <= chunkSize && d.offset + bytes.size <= d.total && digest(bytes) == hash) { "Chunk integrity check failed" }
        require(d.file.length() == d.offset) { "Staging file changed" }
        d.file.appendBytes(bytes)
        d.offset += bytes.size
        d.offset.toDouble()
    }
    @ReactMethod fun discardDownload(id: String, promise: Promise) = queue(promise) {
        if(download?.id == id) { download?.file?.delete(); download = null }
        true
    }
    @ReactMethod fun finishDownload(id: String, name: String, promise: Promise) {
        worker.execute {
            try {
                val d = current(id)
                require(name.length in 1..200 && !name.contains('/') && !name.contains('\\') && !name.any { it.code < 32 })
                require(d.offset == d.total && d.file.length() == d.total && fileDigest(d.file) == d.hash) { "File integrity check failed" }
                download = null
                val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/octet-stream").putExtra(Intent.EXTRA_TITLE,name)
                launch(intent,7812,Pending(promise,null,d.file))
            } catch(e:Exception) { promise.reject("remote_file",e) }
        }
    }
    override fun invalidate(){ctx.removeActivityEventListener(listener);synchronized(this){pending?.file?.delete();pending?.promise?.reject("remote_file","Module stopped");pending=null};worker.execute { download?.file?.delete();download=null;upload?.file?.delete();upload=null };worker.shutdown();super.invalidate()}
}
class RemoteFilePackage : ReactPackage {
    override fun createNativeModules(context:ReactApplicationContext):List<NativeModule> = listOf(RemoteFileModule(context))
    override fun createViewManagers(context:ReactApplicationContext):List<ViewManager<*,*>> = emptyList()
}
