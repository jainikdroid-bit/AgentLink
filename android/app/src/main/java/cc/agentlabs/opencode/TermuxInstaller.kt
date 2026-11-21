package cc.agentlabs.opencode

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Helpers for the in-app "Set up Termux" wizard: which CPU the phone has, opening Termux, the "install unknown apps"
 * permission, downloading the Termux APK (SHA-256 checked) into the app cache, and handing it to the system installer.
 * Nothing is installed silently: Android always shows its own install screen.
 */
class TermuxInstallerModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  companion object {
    const val TERMUX = "com.termux"
    const val DIR = "termux"
    const val EVENT = "TermuxDownloadProgress"
    const val MAX_REDIRECTS = 6
    const val EMIT_INTERVAL_MS = 200L
    const val CONNECT_TIMEOUT_MS = 20_000
    const val READ_TIMEOUT_MS = 30_000
  }

  private val cancelled = AtomicBoolean(false)
  private val busy = AtomicBoolean(false)
  @Volatile private var connection: HttpURLConnection? = null

  override fun getName() = "TermuxInstaller"

  private fun dir(): File = File(ctx.cacheDir, DIR).apply { mkdirs() }

  /** A bare file name inside our cache folder; anything with a path in it is refused. */
  private fun safeFile(name: String): File? {
    if (name.isBlank() || name.contains('/') || name.contains('\\') || name.startsWith(".")) return null
    return File(dir(), name)
  }

  @ReactMethod
  fun deviceAbis(promise: Promise) {
    val arr = Arguments.createArray()
    for (abi in Build.SUPPORTED_ABIS) arr.pushString(abi)
    promise.resolve(arr)
  }

  @ReactMethod
  fun launchTermux(promise: Promise) {
    val intent = ctx.packageManager.getLaunchIntentForPackage(TERMUX)
    if (intent == null) return promise.resolve(false)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      ctx.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("launch_failed", e.message ?: e.toString())
    }
  }

  @ReactMethod
  fun canInstallApps(promise: Promise) {
    promise.resolve(if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.packageManager.canRequestPackageInstalls() else true)
  }

  @ReactMethod
  fun openInstallSettings(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return promise.resolve(false)
    val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      ctx.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("settings_failed", e.message ?: e.toString())
    }
  }

  @ReactMethod
  fun cancelDownload(promise: Promise) {
    cancelled.set(true)
    runCatching { connection?.disconnect() }
    promise.resolve(true)
  }

  private fun emit(received: Long, total: Long) {
    val map = Arguments.createMap()
    map.putDouble("received", received.toDouble())
    map.putDouble("total", total.toDouble())
    runCatching {
      ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(EVENT, map)
    }
  }

  /** Opens the URL and follows redirects by hand (GitHub sends the file from another host). Only https is accepted. */
  private fun open(start: String): HttpURLConnection {
    var current = start
    for (i in 0..MAX_REDIRECTS) {
      val url = URL(current)
      if (url.protocol != "https") throw IllegalArgumentException("only https links are allowed")
      val c = url.openConnection() as HttpURLConnection
      c.instanceFollowRedirects = false
      c.connectTimeout = CONNECT_TIMEOUT_MS
      c.readTimeout = READ_TIMEOUT_MS
      c.setRequestProperty("User-Agent", "AgentLink-Termux-Setup")
      connection = c
      val code = c.responseCode
      if (code in 300..399) {
        val loc = c.getHeaderField("Location") ?: throw IllegalStateException("redirect without a location")
        c.disconnect()
        current = URL(url, loc).toString()
        continue
      }
      if (code != 200) {
        c.disconnect()
        throw IllegalStateException("HTTP $code")
      }
      return c
    }
    throw IllegalStateException("too many redirects")
  }

  @ReactMethod
  fun downloadApk(url: String, sha256: String, fileName: String, promise: Promise) {
    val target = safeFile(fileName) ?: return promise.reject("bad_name", "Bad file name")
    if (!busy.compareAndSet(false, true)) return promise.reject("busy", "A download is already running")
    cancelled.set(false)
    Thread {
      val part = File(target.parentFile, "${target.name}.part")
      try {
        val c = open(url)
        val total = c.contentLengthLong
        val digest = MessageDigest.getInstance("SHA-256")
        var received = 0L
        var lastEmit = 0L
        emit(0, total)
        c.inputStream.use { input ->
          FileOutputStream(part).use { out ->
            val buf = ByteArray(64 * 1024)
            while (true) {
              if (cancelled.get()) throw InterruptedException("cancelled")
              val n = input.read(buf)
              if (n < 0) break
              out.write(buf, 0, n)
              digest.update(buf, 0, n)
              received += n
              val now = System.currentTimeMillis()
              if (now - lastEmit >= EMIT_INTERVAL_MS) {
                lastEmit = now
                emit(received, total)
              }
            }
          }
        }
        emit(received, if (total > 0) total else received)
        val actual = digest.digest().joinToString("") { "%02x".format(it) }
        if (!actual.equals(sha256.trim(), ignoreCase = true)) {
          part.delete()
          promise.reject("checksum", "The downloaded file does not match its checksum")
          return@Thread
        }
        target.delete()
        if (!part.renameTo(target)) throw IllegalStateException("could not save the file")
        promise.resolve(target.absolutePath)
      } catch (e: InterruptedException) {
        part.delete()
        promise.reject("cancelled", "Download cancelled")
      } catch (e: Exception) {
        part.delete()
        promise.reject(if (cancelled.get()) "cancelled" else "download_failed", e.message ?: e.toString())
      } finally {
        runCatching { connection?.disconnect() }
        connection = null
        busy.set(false)
      }
    }.start()
  }

  @ReactMethod
  fun installAppUpdate(path: String, promise: Promise) {
    try {
      val file = File(path)
      if (file.canonicalFile.parentFile != dir().canonicalFile || !file.isFile) {
        return promise.reject("bad_path", "Update file is missing")
      }
      val pm = ctx.packageManager
      @Suppress("DEPRECATION")
      val archive = pm.getPackageArchiveInfo(file.absolutePath, 0)
      @Suppress("DEPRECATION")
      val installed = pm.getPackageInfo(ctx.packageName, 0)
      @Suppress("DEPRECATION")
      fun version(info: android.content.pm.PackageInfo): Long =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else info.versionCode.toLong()
      if (archive == null || archive.packageName != ctx.packageName || version(archive) <= version(installed)) {
        return promise.reject("bad_update", "APK must be a newer version of AgentLink")
      }
      installApk(path, promise)
    } catch (e: Exception) {
      promise.reject("bad_update", e)
    }
  }

  @ReactMethod
  fun installApk(path: String, promise: Promise) {
    val file = File(path)
    val inside = runCatching { file.canonicalFile.parentFile == dir().canonicalFile }.getOrDefault(false)
    if (!inside || !file.isFile) return promise.reject("bad_path", "The APK is not in the app download folder")
    try {
      val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.termuxfiles", file)
      val intent = Intent(Intent.ACTION_VIEW)
        .setDataAndType(uri, "application/vnd.android.package-archive")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("install_failed", e.message ?: e.toString())
    }
  }

  override fun invalidate() {
    cancelled.set(true)
    runCatching { connection?.disconnect() }
    super.invalidate()
  }
}
