package cc.agentlabs.opencode

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import com.facebook.react.uimanager.ViewManager
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * Runs a bash command inside Termux for the agent (phone tool `phone_termux_run`), through Termux's official
 * RUN_COMMAND intent. The result (stdout, stderr, exit code) comes back through a PendingIntent to a receiver
 * registered here. Termux must have `allow-external-apps=true`, and the user must grant our app the
 * "Run commands in Termux environment" permission. Each call is approved on the phone before it gets here.
 */
class TermuxModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  companion object {
    const val TERMUX = "com.termux"
    const val PERMISSION = "com.termux.permission.RUN_COMMAND"
    const val SERVICE = "com.termux.app.RunCommandService"
    const val ACTION_RUN = "com.termux.RUN_COMMAND"
    const val BASH = "/data/data/com.termux/files/usr/bin/bash"
    const val HOME = "/data/data/com.termux/files/home"
    const val EXECUTION_ID = "agentlink_execution_id"
    const val PERMISSION_REQUEST = 47110
    const val MIN_TIMEOUT_MS = 1_000L
    const val MAX_TIMEOUT_MS = 310_000L
  }

  private val resultAction = "${ctx.packageName}.TERMUX_RESULT"
  private val pending = ConcurrentHashMap<Int, Promise>()
  private val nextId = AtomicInteger(1)
  private val handler = Handler(Looper.getMainLooper())
  @Volatile private var registered = false

  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      val id = intent.getIntExtra(EXECUTION_ID, -1)
      val promise = pending.remove(id) ?: return
      val bundle = intent.getBundleExtra("result")
      if (bundle == null) {
        promise.reject("no_result", "Termux returned no result")
        return
      }
      val map = Arguments.createMap()
      map.putString("stdout", bundle.getString("stdout") ?: "")
      map.putString("stderr", bundle.getString("stderr") ?: "")
      map.putInt("exitCode", bundle.getInt("exitCode", -1))
      map.putInt("errCode", bundle.getInt("err", -1))
      map.putString("errmsg", bundle.getString("errmsg") ?: "")
      promise.resolve(map)
    }
  }

  override fun getName() = "TermuxRunner"

  private fun installed(): Boolean =
    try {
      ctx.packageManager.getPackageInfo(TERMUX, 0)
      true
    } catch (e: PackageManager.NameNotFoundException) {
      false
    }

  private fun granted(): Boolean = ContextCompat.checkSelfPermission(ctx, PERMISSION) == PackageManager.PERMISSION_GRANTED

  @Synchronized
  private fun ensureReceiver() {
    if (registered) return
    ContextCompat.registerReceiver(ctx, receiver, IntentFilter(resultAction), ContextCompat.RECEIVER_NOT_EXPORTED)
    registered = true
  }

  @ReactMethod
  fun isInstalled(promise: Promise) = promise.resolve(installed())

  @ReactMethod
  fun hasPermission(promise: Promise) = promise.resolve(granted())

  @ReactMethod
  fun requestPermission(promise: Promise) {
    if (granted()) return promise.resolve(true)
    val activity = reactApplicationContext.currentActivity as? PermissionAwareActivity
      ?: return promise.reject("no_activity", "Open the app to grant the Termux permission")
    activity.requestPermissions(arrayOf(PERMISSION), PERMISSION_REQUEST, PermissionListener { code, _, results ->
      if (code != PERMISSION_REQUEST) return@PermissionListener false
      promise.resolve(results.isNotEmpty() && results[0] == PackageManager.PERMISSION_GRANTED)
      true
    })
  }

  @ReactMethod
  fun run(command: String, cwd: String?, timeoutMs: Double, promise: Promise) {
    if (!installed()) return promise.reject("not_installed", "Termux is not installed on the phone")
    if (!granted()) return promise.reject("no_permission", "AgentLink may not run commands in Termux yet")
    ensureReceiver()
    val id = nextId.getAndIncrement()
    val result = Intent(resultAction).setPackage(ctx.packageName).putExtra(EXECUTION_ID, id)
    val flags = PendingIntent.FLAG_ONE_SHOT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
    val callback = PendingIntent.getBroadcast(ctx, id, result, flags)
    val intent = Intent()
      .setClassName(TERMUX, SERVICE)
      .setAction(ACTION_RUN)
      .putExtra("com.termux.RUN_COMMAND_PATH", BASH)
      .putExtra("com.termux.RUN_COMMAND_ARGUMENTS", arrayOf("-lc", command))
      .putExtra("com.termux.RUN_COMMAND_WORKDIR", cwd?.takeIf { it.isNotBlank() } ?: HOME)
      .putExtra("com.termux.RUN_COMMAND_BACKGROUND", true)
      .putExtra("com.termux.RUN_COMMAND_PENDING_INTENT", callback)
    pending[id] = promise
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent) else ctx.startService(intent)
    } catch (e: SecurityException) {
      pending.remove(id)
      return promise.reject("no_permission", e.message ?: "Termux refused the request")
    } catch (e: Exception) {
      pending.remove(id)
      return promise.reject("start_failed", e.message ?: e.toString())
    }
    val wait = timeoutMs.toLong().coerceIn(MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)
    handler.postDelayed({ pending.remove(id)?.reject("timeout", "Termux did not answer in time") }, wait)
  }

  override fun invalidate() {
    if (registered) runCatching { ctx.unregisterReceiver(receiver) }
    registered = false
    for (p in pending.values) p.reject("stopped", "The app stopped before Termux answered")
    pending.clear()
    super.invalidate()
  }
}

class TermuxPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(TermuxModule(reactContext), TermuxInstallerModule(reactContext))
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
