package cc.agentlabs.opencode

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ViewManager
import java.lang.ref.WeakReference
import kotlin.math.hypot

/**
 * Touches on the floating 3D Cheri, decided at the window level (MainActivity.dispatchTouchEvent):
 *  - a short tap goes straight through her to whatever is underneath;
 *  - holding still for HOLD_MS "picks her up" (a light haptic tick): from then on the gesture is hers,
 *    one finger drags, two fingers pinch to resize;
 *  - holding still for MENU_MS opens her menu.
 * The JS side tells us where she is (setRect, window pixels) and listens to "CheriTouch" events.
 */
object CheriTouch {
  private const val HOLD_MS = 380L
  private const val MENU_MS = 950L

  @Volatile var left = 0f
  @Volatile var top = 0f
  @Volatile var right = 0f
  @Volatile var bottom = 0f
  @Volatile var enabled = false
  var context: WeakReference<ReactApplicationContext>? = null

  private enum class Mode { IDLE, PENDING, ACTIVE, MENU }
  private var mode = Mode.IDLE
  private val handler = Handler(Looper.getMainLooper())
  private var downX = 0f
  private var downY = 0f
  private var lastX = 0f
  private var lastY = 0f
  private var moved = false
  private var pinchStart = 0f
  private var pinchScale = 1f
  private var root: WeakReference<View>? = null
  private var forward: ((MotionEvent) -> Boolean)? = null

  private fun density(): Float = context?.get()?.resources?.displayMetrics?.density ?: 1f

  private fun emit(type: String, fill: (WritableMap) -> Unit = {}) {
    val ctx = context?.get() ?: return
    if (!ctx.hasActiveReactInstance()) return
    val map = Arguments.createMap()
    map.putString("type", type)
    fill(map)
    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("CheriTouch", map)
  }

  private val activate = Runnable {
    if (mode != Mode.PENDING) return@Runnable
    mode = Mode.ACTIVE
    root?.get()?.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
    // whatever was under her got the down event: tell it the gesture is over
    val now = SystemClock.uptimeMillis()
    val cancel = MotionEvent.obtain(now, now, MotionEvent.ACTION_CANCEL, lastX, lastY, 0)
    forward?.invoke(cancel)
    cancel.recycle()
    emit("pickUp")
  }

  private val openMenu = Runnable {
    if ((mode == Mode.ACTIVE || mode == Mode.PENDING) && !moved) {
      if (mode == Mode.PENDING) activate.run()
      mode = Mode.MENU
      emit("menu")
    }
  }

  private fun reset() {
    handler.removeCallbacks(activate)
    handler.removeCallbacks(openMenu)
    mode = Mode.IDLE
    moved = false
    pinchStart = 0f
  }

  /** Returns true when the event belongs to Cheri and must not reach the app underneath. */
  fun handle(view: View, ev: MotionEvent, superDispatch: (MotionEvent) -> Boolean): Boolean {
    when (ev.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        reset()
        if (enabled && ev.x in left..right && ev.y in top..bottom) {
          mode = Mode.PENDING
          downX = ev.x
          downY = ev.y
          lastX = ev.x
          lastY = ev.y
          root = WeakReference(view)
          forward = superDispatch
          handler.postDelayed(activate, HOLD_MS)
          handler.postDelayed(openMenu, MENU_MS)
        }
        return false
      }
      MotionEvent.ACTION_MOVE -> when (mode) {
        Mode.PENDING -> {
          lastX = ev.x
          lastY = ev.y
          if (hypot(ev.x - downX, ev.y - downY) > 14 * density()) reset() // a scroll or swipe: not for her
          return false
        }
        Mode.ACTIVE -> {
          val d = density()
          if (ev.pointerCount >= 2) {
            val spread = hypot(ev.getX(0) - ev.getX(1), ev.getY(0) - ev.getY(1))
            if (pinchStart <= 0f) {
              pinchStart = spread.coerceAtLeast(1f)
              emit("pinchStart")
            }
            pinchScale = spread / pinchStart
            moved = true
            emit("pinch") { it.putDouble("scale", pinchScale.toDouble()) }
          } else {
            val dx = (ev.x - lastX) / d
            val dy = (ev.y - lastY) / d
            if (!moved && hypot(ev.x - downX, ev.y - downY) > 10 * d) {
              moved = true
              handler.removeCallbacks(openMenu)
            }
            if (moved && (dx != 0f || dy != 0f)) emit("drag") { it.putDouble("dx", dx.toDouble()); it.putDouble("dy", dy.toDouble()) }
          }
          lastX = ev.x
          lastY = ev.y
          return true
        }
        Mode.MENU -> return true
        Mode.IDLE -> return false
      }
      MotionEvent.ACTION_POINTER_UP -> {
        if (mode == Mode.ACTIVE && pinchStart > 0f) {
          emit("pinchEnd") { it.putDouble("scale", pinchScale.toDouble()) }
          pinchStart = 0f
          // keep dragging with the finger that stays
          val stay = if (ev.actionIndex == 0) 1 else 0
          lastX = ev.getX(stay)
          lastY = ev.getY(stay)
          return true
        }
        return mode == Mode.ACTIVE || mode == Mode.MENU
      }
      MotionEvent.ACTION_POINTER_DOWN -> return mode == Mode.ACTIVE || mode == Mode.MENU
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        val mine = mode == Mode.ACTIVE || mode == Mode.MENU
        if (mode == Mode.ACTIVE) {
          if (pinchStart > 0f) emit("pinchEnd") { it.putDouble("scale", pinchScale.toDouble()) }
          emit("drop")
        }
        reset()
        return mine
      }
    }
    return mode == Mode.ACTIVE || mode == Mode.MENU
  }
}

class CheriTouchModule(ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  init {
    CheriTouch.context = WeakReference(ctx)
  }

  override fun getName() = "CheriTouch"

  /** Where she is, in window pixels; enabled = false lets every touch through. */
  @ReactMethod
  fun setRect(x: Double, y: Double, w: Double, h: Double, enabled: Boolean) {
    CheriTouch.left = x.toFloat()
    CheriTouch.top = y.toFloat()
    CheriTouch.right = (x + w).toFloat()
    CheriTouch.bottom = (y + h).toFloat()
    CheriTouch.enabled = enabled
  }

  // required by NativeEventEmitter on the JS side
  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Double) = Unit
}

class CheriTouchPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(CheriTouchModule(reactContext))
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
