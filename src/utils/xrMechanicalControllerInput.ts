import * as THREE from "three";
import { Context } from "../context";

// Working variables, prevents "new" allocations
const __rot = new THREE.Quaternion();
const __wristOffset = new THREE.Vector3();
const __euler = new THREE.Euler();
const __wristQuat = new THREE.Quaternion();
const __tempVec = new THREE.Vector3();
const __prevQuatInverse = new THREE.Quaternion();
const __deltaQuat = new THREE.Quaternion();
const __angularAxis = new THREE.Vector3();

/**
 * Manages the standard WebXR mechanical "grip" controller.
 */
export class XrMechanicalControllerInput {
  context: Context;
  _grip: any;
  _gamePad: any;
  _handSide: string;
  _wristAxis: THREE.AxesHelper;
  select: boolean;
  squeeze: boolean;
  touchPad: THREE.Vector2;
  touchPadButton: boolean;
  thumbStick: THREE.Vector2;
  thumbStickButton: boolean;
  buttonA: boolean;
  buttonB: boolean;
  hasHand: boolean;
  _localPosition: THREE.Vector3;
  _localRotation: THREE.Quaternion;
  _worldPosition: THREE.Vector3;
  _worldRotation: THREE.Quaternion;
  pointerActive: boolean;
  _pointerWOrigin: THREE.Vector3;
  _pointerWDirection: THREE.Vector3;
  _lastUpdate: number;
  _debugSphere?: THREE.Mesh;
  _buttonStateIndicator?: THREE.Mesh;
  isNearGrip: boolean;
  distanceToGrip: number;

  // Angular velocity tracking
  _previousWorldRotation: THREE.Quaternion;
  _angularVelocity: THREE.Vector3;  // Angular velocity in rad/s (axis * angle)
  _yawVelocity: number;  // Yaw (Y-axis) angular velocity in rad/s
  _previousTime: number;

  constructor(context: Context, grip: any, gamePad: any, handSide: string) {
    this.context = context;
    this._grip = grip;
    this._gamePad = gamePad;
    this._handSide = handSide;
    this._wristAxis = new THREE.AxesHelper(0.1);

    this.select = false;
    this.squeeze = false;

    this.touchPad = new THREE.Vector2();
    this.touchPadButton = false;
    this.thumbStick = new THREE.Vector2();
    this.thumbStickButton = false;
    this.buttonA = false;
    this.buttonB = false;
    this.hasHand = false;

    this._localPosition = new THREE.Vector3();
    this._localRotation = new THREE.Quaternion();
    this._worldPosition = new THREE.Vector3();
    this._worldRotation = new THREE.Quaternion();
    this.pointerActive = true;
    this._pointerWOrigin = new THREE.Vector3();
    this._pointerWDirection = new THREE.Vector3();
    this._lastUpdate = -1;
    this.isNearGrip = false;
    this.distanceToGrip = Infinity;

    // Initialize angular velocity tracking
    this._previousWorldRotation = new THREE.Quaternion();
    this._angularVelocity = new THREE.Vector3();
    this._yawVelocity = 0;
    this._previousTime = performance.now();

    // Create visual debug sphere for controller position
    this.createDebugVisualization();
  }

  /**
   * Get the yaw (Y-axis) angular velocity in rad/s
   * Positive = counterclockwise when viewed from above
   * Negative = clockwise when viewed from above
   */
  get yawAngularVelocity(): number {
    return this._yawVelocity;
  }

  /**
   * Get the full angular velocity vector
   */
  get angularVelocity(): THREE.Vector3 {
    return this._angularVelocity;
  }

  /*
   * Position of the head tracker relative to the parent object.
   */
  get wristLPos() {
    this.refresh();
    return this._localPosition;
  }

  /*
   * Rotation of the head tracker relative to the parent object.
   */
  get wristLQuat() {
    this.refresh();
    return this._localRotation;
  }

  /*
   * position of head in world coordinates
   */
  get wristWPos() {
    this.refresh();
    return this._worldPosition;
  }

  /*
   * rotation of head in world orientation
   */
  get wristWQuat() {
    this.refresh();
    return this._worldRotation;
  }

  /*
   *  The position of the pointer that matches the controller
   */
  get pointerWOrigin() {
    this.refresh();
    return this._pointerWOrigin;
  }

  /*
   *  The direction of the pointer that matches the controller
   */
  get pointerWDirection() {
    this.refresh();
    return this._pointerWDirection;
  }

  /*
   * Apply haptic feedback to the controller (vibrate)
   */
  vibrate(intensity: any, timeMs: any) {
    if (this._gamePad.hapticActuators && this._gamePad.hapticActuators.length >= 1) {
      this._gamePad.hapticActuators[0].pulse(intensity || 1, timeMs || 100);
    }
  }

  /*
   * Create visual debug elements for controller
   */
  createDebugVisualization() {
    // Create a small sphere to represent controller position
    const sphereGeometry = new THREE.SphereGeometry(0.02, 16, 16);
    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: this._handSide === 'left' ? 0x0088ff : 0xff8800,
      emissive: this._handSide === 'left' ? 0x0088ff : 0xff8800,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.8
    });
    this._debugSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);

    // Create button state indicator (changes color based on buttons pressed)
    const indicatorGeometry = new THREE.RingGeometry(0.025, 0.035, 16);
    const indicatorMaterial = new THREE.MeshBasicMaterial({
      color: 0x888888,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6
    });
    this._buttonStateIndicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
    this._buttonStateIndicator.position.z = -0.01;
  }

  /*
   * Update proximity detection to nearest grip marker
   * Note: Haptic feedback is now handled by GripSystem
   */
  updateProximityToGrip() {
    // Get the appropriate grip marker based on hand side
    const targetGrip = this._handSide === 'left'
      ? this.context.leftGripMarker
      : this.context.rightGripMarker;

    if (!targetGrip) {
      this.isNearGrip = false;
      this.distanceToGrip = Infinity;
      return;
    }

    // Calculate distance from controller to grip marker
    targetGrip.getWorldPosition(__tempVec);
    this.distanceToGrip = this.wristWPos.distanceTo(__tempVec);

    // Define "near" as within 10cm (0.1m)
    const proximityThreshold = 0.1;
    this.isNearGrip = this.distanceToGrip < proximityThreshold;

    // Update debug sphere visual feedback based on proximity
    if (this._debugSphere) {
      const material = this._debugSphere.material as THREE.MeshStandardMaterial;
      if (this.isNearGrip) {
        // Change to green and glow when near grip
        material.color.setHex(0x00ff00);
        material.emissive.setHex(0x00ff00);
        material.emissiveIntensity = 0.8;
        material.opacity = 1.0;
      } else {
        // Return to original hand color
        material.color.setHex(this._handSide === 'left' ? 0x0088ff : 0xff8800);
        material.emissive.setHex(this._handSide === 'left' ? 0x0088ff : 0xff8800);
        material.emissiveIntensity = 0.3;
        material.opacity = 0.8;
      }
    }
  }

  /*
   * Update button state visualization
   */
  updateButtonStateDisplay() {
    if (!this._buttonStateIndicator) return;

    const material = this._buttonStateIndicator.material as THREE.MeshBasicMaterial;

    // Show different colors based on button states
    if (this.squeeze) {
      // Squeeze/Grip button - Yellow
      material.color.setHex(0xffff00);
      material.opacity = 1.0;
    } else if (this.select) {
      // Select/Trigger button - Red
      material.color.setHex(0xff0000);
      material.opacity = 1.0;
    } else if (this.buttonA) {
      // A button - Green
      material.color.setHex(0x00ff00);
      material.opacity = 1.0;
    } else if (this.buttonB) {
      // B button - Blue
      material.color.setHex(0x0000ff);
      material.opacity = 1.0;
    } else if (this.thumbStickButton) {
      // Thumbstick pressed - Purple
      material.color.setHex(0xff00ff);
      material.opacity = 1.0;
    } else {
      // No buttons pressed - Gray
      material.color.setHex(0x888888);
      material.opacity = 0.3;
    }
  }

  /**
   * Called when the controller is connected
   */
  onConnect() {
    this.context.scene.add(this._wristAxis);

    // Add debug visualization to scene
    if (this._debugSphere) {
      this.context.scene.add(this._debugSphere);
    }
    if (this._buttonStateIndicator) {
      this.context.scene.add(this._buttonStateIndicator);
    }

    console.log(`${this._handSide} controller visualization enabled`);
  }

  /**
   * Called on each animation frame
   */
  onAnimate() {
    this._wristAxis.position.copy(this.wristWPos);
    this._wristAxis.quaternion.copy(this.wristWQuat);

    // Check if controller is attached to grip (GripSystem manages position when attached)
    const isAttached = this.context.gripSystem?.isHandAttached(
      this._handSide as "left" | "right"
    );

    // Update debug sphere position (only if not attached - GripSystem handles attached position)
    if (this._debugSphere && !isAttached) {
      this._debugSphere.position.copy(this.wristWPos);
    }

    // Update button state indicator position and orientation
    if (this._buttonStateIndicator) {
      this._buttonStateIndicator.position.copy(this.wristWPos);
      this._buttonStateIndicator.quaternion.copy(this.wristWQuat);
    }

    // Update proximity detection and visual feedback
    this.updateProximityToGrip();

    // Update button state visualization
    this.updateButtonStateDisplay();
  }

  /**
   * Called when the controller is disconnected
   */
  onDisconnect() {
    this._wristAxis?.removeFromParent();
    this._debugSphere?.removeFromParent();
    this._buttonStateIndicator?.removeFromParent();
  }

  /*
   * In order to keep the reference points like the wrist location and the
   * pointer location abstracted from input (hand or controller) map
   * the wrist position and rotation to a [[[]]] and position the pointer
   * at the point in the controller that makes sense for the controller.
   */
  refresh() {
    if (this._lastUpdate == this.context.frame) return; // already updated for this frame
    this._lastUpdate = this.context.frame;

    // Position, and determine local (to the parent) position
    this._grip.getWorldPosition(this._worldPosition);
    this._grip.getWorldQuaternion(this._worldRotation);

    // Offset the world position to find the wrist location
    const offset =
      this._handSide == "left"
        ? { x: -0.02, y: 0.0, z: 0.09 } // Left Wrist offset
        : { x: 0.02, y: 0.0, z: 0.09 }; // Right Wrist offset
    __wristOffset.set(offset.x, offset.y, offset.z);
    __wristOffset.applyQuaternion(this._worldRotation);
    this._worldPosition.add(__wristOffset);

    // Convert world position and rotation to relative to the parent object
    this._localPosition.copy(this._worldPosition);
    this._localPosition.sub(this._grip.parent.position);
    __rot.copy(this._grip.parent.quaternion).invert();
    this._localPosition.applyQuaternion(__rot);

    // Rotate the hand so that the fingers are forward, thumb up position
    if (this._handSide == "left") {
      __wristQuat.setFromEuler(__euler.set(0.0, (Math.PI / 8.0) * 1.5, Math.PI / 2.0, "ZYX"));
    } else {
      __wristQuat.setFromEuler(__euler.set(0.0, (-Math.PI / 8.0) * 1.5, -Math.PI / 2.0, "ZYX"));
    }
    this._worldRotation.multiply(__wristQuat);

    // Rotation, and determine local (to the parent) rotation
    this._localRotation.copy(this._grip.parent.quaternion);
    this._localRotation.invert();
    this._localRotation.multiply(this._worldRotation);

    // Pointer
    this._grip.getWorldPosition(this._pointerWOrigin.setScalar(0));
    this._pointerWDirection.set(0, -1, -1).normalize(); // Forward
    this._grip.getWorldQuaternion(__rot);
    this._pointerWDirection.applyQuaternion(__rot);

    // update gamepad
    // https://www.w3.org/TR/webxr-gamepads-module-1/
    if (this._gamePad) {
      let axis = this._gamePad.axes;
      if (axis && axis.length > 3) {
        // Mixed Reality
        this.touchPad.set(axis[0], axis[1]);
        // Mixed Reality and Quest 2
        this.thumbStick.set(axis[2], axis[3]);
      }
      let buttons = this._gamePad.buttons;
      if (buttons) {
        // Mixed Reality and Quest 2
        this.touchPadButton = buttons.length > 2 ? buttons[2].pressed : false;
        this.thumbStickButton = buttons.length > 3 ? buttons[3].pressed : false;
        // Quest 2
        this.buttonA = buttons.length > 4 ? buttons[4].pressed : false;
        this.buttonB = buttons.length > 5 ? buttons[5].pressed : false;
      }
    }

    // Calculate angular velocity
    const currentTime = performance.now();
    const deltaTime = (currentTime - this._previousTime) / 1000; // Convert to seconds

    if (deltaTime > 0 && deltaTime < 0.5) { // Avoid divide by zero and large jumps
      // Calculate rotation difference: deltaQuat = current * inverse(previous)
      __prevQuatInverse.copy(this._previousWorldRotation).invert();
      __deltaQuat.multiplyQuaternions(this._worldRotation, __prevQuatInverse);

      // Convert quaternion to axis-angle
      const angle = 2 * Math.acos(Math.min(1, Math.abs(__deltaQuat.w)));

      if (angle > 0.0001) { // Avoid division by zero
        const sinHalfAngle = Math.sin(angle / 2);
        __angularAxis.set(
          __deltaQuat.x / sinHalfAngle,
          __deltaQuat.y / sinHalfAngle,
          __deltaQuat.z / sinHalfAngle
        );

        // Angular velocity = axis * (angle / deltaTime)
        const angularSpeed = angle / deltaTime;
        this._angularVelocity.copy(__angularAxis).multiplyScalar(angularSpeed);

        // Extract yaw velocity (rotation around Y-axis)
        // This is the component we care about for handlebar rotation
        this._yawVelocity = this._angularVelocity.y;
      } else {
        this._angularVelocity.set(0, 0, 0);
        this._yawVelocity = 0;
      }
    }

    // Store current rotation and time for next frame
    this._previousWorldRotation.copy(this._worldRotation);
    this._previousTime = currentTime;
  }
}
