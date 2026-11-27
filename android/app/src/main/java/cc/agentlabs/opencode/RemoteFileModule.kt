package cc.agentlabs.opencode

import android.app.Activity
import android.content.Intent
import android.util.Base64
import android.provider.OpenableColumns
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.util.concurrent.Executors

/** Explicit document picker; no broad storage permission. Bounded transfer in either direction. */
class RemoteFileModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
    private val max = 4 * 1024 * 1024
    private val worker = Executors.newSingleThreadExecutor()
    private data class Pending(val promise: Promise, val data: ByteArray?)
    private var pending: Pending? = null
    private val listener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode != 7811 && requestCode != 7812) return
            val job = synchronized(this@RemoteFileModule) { val p = pending; pending = null; p } ?: return
            if (resultCode != Activity.RESULT_OK || data?.data == null) { job.promise.resolve(null); return }
            val uri = data.data!!
            worker.execute {
                try {
                    if (requestCode == 7811 && job.data == null) {
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
                    } else if(requestCode == 7812 && job.data != null) {
                        ctx.contentResolver.openOutputStream(uri,"w")?.use { it.write(job.data);it.flush() } ?: error("Cannot save document")
                        job.promise.resolve(true)
                    } else error("Unexpected document action")
                } catch(e: Exception) { job.promise.reject("remote_file",e) }
            }
        }
    }
    init { ctx.addActivityEventListener(listener) }
    override fun getName() = "AgentLinkRemoteFiles"
    private fun digest(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) }
    private fun launch(intent: Intent, request: Int, job: Pending) {
        val activity = currentActivity ?: run { job.promise.reject("remote_file","No foreground activity");return }
        synchronized(this) { if(pending!=null){job.promise.reject("remote_file","A file picker is already open");return};pending=job }
        activity.runOnUiThread {
            try { activity.startActivityForResult(intent,request) }
            catch(e:Exception){synchronized(this){pending=null};job.promise.reject("remote_file",e)}
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
    override fun invalidate(){ctx.removeActivityEventListener(listener);synchronized(this){pending?.promise?.reject("remote_file","Module stopped");pending=null};worker.shutdown();super.invalidate()}
}
class RemoteFilePackage : ReactPackage {
    override fun createNativeModules(context:ReactApplicationContext):List<NativeModule> = listOf(RemoteFileModule(context))
    override fun createViewManagers(context:ReactApplicationContext):List<ViewManager<*,*>> = emptyList()
}
