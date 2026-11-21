import { MathUtils, Matrix4, Quaternion, Vector3, type Object3D } from "three"
import type { VRM } from "@pixiv/three-vrm"
import { stepOffset, WALK_MILLISECONDS } from "../../src/lib/cheri/walk"

const UP = new Vector3(0, 1, 0)
const FORWARD = new Vector3(0, 0, 1)

function boneFrame(down: Vector3, axis: Vector3, matrix: Matrix4, result: Quaternion, y: Vector3, z: Vector3) {
  y.copy(down).negate().normalize()
  z.crossVectors(axis, y).normalize()
  return result.setFromRotationMatrix(matrix.makeBasis(axis, y, z))
}

function bindFrame(child: Object3D, forward: Vector3) {
  const axis = new Vector3().crossVectors(child.position, forward).normalize()
  return boneFrame(child.position, axis, new Matrix4(), new Quaternion(), new Vector3(), new Vector3()).invert()
}

/** The knee lies in the plane formed by the ankle target and the forward pole. */
function placeKnee(
  hip: Vector3, ankle: Vector3, forward: Vector3, upperLength: number, lowerLength: number,
  chain: Vector3, bend: Vector3, knee: Vector3,
) {
  chain.subVectors(ankle, hip)
  const length = MathUtils.clamp(chain.length(), Math.abs(upperLength - lowerLength) + 0.02, upperLength + lowerLength - 0.002)
  chain.normalize()
  ankle.copy(hip).addScaledVector(chain, length)
  bend.copy(forward).addScaledVector(chain, -forward.dot(chain)).normalize()
  const along = (upperLength ** 2 - lowerLength ** 2 + length ** 2) / (2 * length)
  const reach = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2))
  return knee.copy(hip).addScaledVector(chain, along).addScaledVector(bend, reach)
}

/** Solve the normalized skeleton; three-vrm transfers the pose to the skinned bones. */
export function createLegRig(model: VRM) {
  const forward = new Vector3()
  const sideAxis = new Vector3()
  const travel = new Quaternion()
  const waist = new Vector3()
  const hips = model.humanoid.getNormalizedBoneNode("hips")
  const restHips = hips?.position.clone()
  const anchor = model.scene.getWorldPosition(new Vector3())
  const legs = ([["left", 0], ["right", 1]] as const).flatMap(([side, index]) => {
    const upper = model.humanoid.getNormalizedBoneNode(`${side}UpperLeg`)
    const lower = model.humanoid.getNormalizedBoneNode(`${side}LowerLeg`)
    const foot = model.humanoid.getNormalizedBoneNode(`${side}Foot`)
    const toes = model.humanoid.getNormalizedBoneNode(`${side}Toes`)
    if (!upper || !lower || !foot || !toes) return []
    const upperLength = lower.position.length()
    const lowerLength = foot.position.length()
    const restFoot = foot.getWorldPosition(new Vector3()).sub(anchor)
    const footOrientation = foot.getWorldQuaternion(new Quaternion())
    const bindForward = FORWARD.clone().applyQuaternion(upper.getWorldQuaternion(new Quaternion()).invert())
    const upperBind = bindFrame(lower, bindForward)
    const lowerBind = bindFrame(foot, bindForward)
    // Relax the knees a few degrees in the standing pose, with feet below the hips.
    const offset = (index === 0 ? 1 : -1) * 0.1
    return [{ index, upper, lower, foot, toes, upperLength, lowerLength, upperBind, lowerBind, restFoot, footOrientation, offset }]
  })
  const hip = new Vector3()
  const ankle = new Vector3()
  const knee = new Vector3()
  const chain = new Vector3()
  const bend = new Vector3()
  const axis = new Vector3()
  const dir = new Vector3()
  const y = new Vector3()
  const z = new Vector3()
  const matrix = new Matrix4()
  const desired = new Quaternion()
  const parent = new Quaternion()
  const shoePitch = new Quaternion()

  function orient(node: Object3D, rotation: Quaternion) {
    node.parent!.getWorldQuaternion(parent)
    node.quaternion.copy(parent.invert().multiply(rotation))
    node.updateWorldMatrix(false, false)
  }

  return (turn: number, time: number, walk: number, lift: number) => {
    travel.setFromAxisAngle(UP, turn)
    forward.copy(FORWARD).applyQuaternion(travel)
    sideAxis.crossVectors(UP, forward)
    // Shift the pelvis behind the feet in a squat so the knees have room to bend.
    if (hips && restHips) {
      hips.position.copy(restHips)
      const stride = time * 1000 / WALK_MILLISECONDS
      hips.position.y -= walk * (0.027 + 0.009 * Math.cos(stride * 4 * Math.PI))
      if (lift < 0) {
        hips.parent!.getWorldQuaternion(parent).invert()
        waist.copy(forward).multiplyScalar(lift * 0.66).applyQuaternion(parent)
        hips.position.add(waist)
      }
      hips.updateWorldMatrix(true, false)
    }
    model.scene.getWorldPosition(waist)
    for (const leg of legs) {
      const step = stepOffset(time, leg.index)
      leg.upper.getWorldPosition(hip)
      ankle.copy(waist)
        .addScaledVector(sideAxis, leg.offset)
        .addScaledVector(forward, leg.restFoot.z + walk * step.forward)
      // The supporting shoe stays on the floor during a crouch; both feet lift in a jump.
      ankle.y = anchor.y + leg.restFoot.y + Math.max(0, lift) * 1.37 + walk * step.lift
      placeKnee(hip, ankle, forward, leg.upperLength, leg.lowerLength, chain, bend, knee)
      axis.crossVectors(chain, bend).normalize()
      orient(leg.upper, boneFrame(dir.subVectors(knee, hip), axis, matrix, desired, y, z).multiply(leg.upperBind))
      orient(leg.lower, boneFrame(dir.subVectors(ankle, knee), axis, matrix, desired, y, z).multiply(leg.lowerBind))
      shoePitch.setFromAxisAngle(sideAxis, walk * step.pitch)
      orient(leg.foot, desired.copy(shoePitch).multiply(travel).multiply(leg.footOrientation))
      leg.toes.quaternion.identity()
    }
  }
}
