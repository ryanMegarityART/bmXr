import * as THREE from "three";
import { Context } from "../context";
import { XrMechanicalControllerInput } from "../utils/xrMechanicalControllerInput";

// Working variables to prevent allocations
const __tempVec = new THREE.Vector3();
const __gripWorldPos = new THREE.Vector3();

/**
 * Grip zone configuration
 */
export interface GripZone {
  marker: THREE.Mesh;
  position: THREE.Vector3;
  proximityThreshold: number; // Distance to trigger "near grip" state
  grabThreshold: number; // Distance to allow actual grab
}

/**
 * State of grip for a single hand
 */
export enum GripState {
  IDLE = "IDLE", // Not near grip
  NEAR = "NEAR", // Within proximity threshold
  GRIPPING = "GRIPPING", // Actively gripping (button pressed while near)
}

/**
 * Per-hand grip tracking data
 */
export interface HandGripData {
  state: GripState;
  wasNear: boolean; // Was near grip zone last frame
  isNear: boolean; // Is near grip zone this frame
  distance: number; // Current distance to grip zone
  gripZone: GripZone | null; // Reference to the grip zone
  gripButtonPressed: boolean; // Is grip button currently pressed
  wasGripButtonPressed: boolean; // Was grip button pressed last frame
}

/**
 * Events emitted by the GripSystem
 */
export type GripEventType =
  | "enterProximity" // Controller entered grip zone proximity
  | "exitProximity" // Controller left grip zone proximity
  | "gripStart" // Started gripping (button pressed while near)
  | "gripEnd"; // Stopped gripping (button released or left zone)

export interface GripEvent {
  type: GripEventType;
  hand: "left" | "right";
  distance: number;
}

type GripEventListener = (event: GripEvent) => void;

/**
 * GripSystem manages handlebar grip detection, visual feedback, and haptic responses.
 *
 * Features:
 * - Defines grip zones on left and right handlebars
 * - Proximity detection with configurable thresholds
 * - Haptic pulse feedback when entering/exiting grip zones
 * - Visual highlight when grip is available
 * - Grip button mapping (squeeze/grip button)
 * - Event system for grip state changes
 */
export class GripSystem {
  context: Context;

  // Grip zones
  leftGripZone: GripZone | null = null;
  rightGripZone: GripZone | null = null;

  // Per-hand grip state
  leftHandGrip: HandGripData;
  rightHandGrip: HandGripData;

  // Configuration
  proximityThreshold: number = 0.1; // 10cm - when to show "can grip" feedback
  grabThreshold: number = 0.08; // 8cm - when grip button will attach

  // Event listeners
  private listeners: Map<GripEventType, GripEventListener[]> = new Map();

  // Visual feedback materials
  private highlightMaterial: THREE.MeshStandardMaterial;
  private normalMaterial: THREE.MeshStandardMaterial;
  private grippingMaterial: THREE.MeshStandardMaterial;

  constructor(context: Context) {
    this.context = context;

    // Initialize per-hand grip data
    this.leftHandGrip = this.createHandGripData();
    this.rightHandGrip = this.createHandGripData();

    // Create materials for visual feedback
    this.normalMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      emissive: 0x00ff00,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.5,
    });

    this.highlightMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      emissive: 0x00ff00,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.9,
    });

    this.grippingMaterial = new THREE.MeshStandardMaterial({
      color: 0xffff00,
      emissive: 0xffff00,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 1.0,
    });

    // Initialize event listener maps
    this.listeners.set("enterProximity", []);
    this.listeners.set("exitProximity", []);
    this.listeners.set("gripStart", []);
    this.listeners.set("gripEnd", []);
  }

  /**
   * Create initial hand grip data
   */
  private createHandGripData(): HandGripData {
    return {
      state: GripState.IDLE,
      wasNear: false,
      isNear: false,
      distance: Infinity,
      gripZone: null,
      gripButtonPressed: false,
      wasGripButtonPressed: false,
    };
  }

  /**
   * Initialize grip zones once handlebars and markers are ready
   */
  initializeGripZones(): void {
    if (!this.context.leftGripMarker || !this.context.rightGripMarker) {
      console.warn("GripSystem: Grip markers not ready yet");
      return;
    }

    // Create left grip zone
    this.leftGripZone = {
      marker: this.context.leftGripMarker,
      position: new THREE.Vector3(),
      proximityThreshold: this.proximityThreshold,
      grabThreshold: this.grabThreshold,
    };

    // Create right grip zone
    this.rightGripZone = {
      marker: this.context.rightGripMarker,
      position: new THREE.Vector3(),
      proximityThreshold: this.proximityThreshold,
      grabThreshold: this.grabThreshold,
    };

    // Set initial material
    this.leftGripZone.marker.material = this.normalMaterial.clone();
    this.rightGripZone.marker.material = this.normalMaterial.clone();

    // Update grip data references
    this.leftHandGrip.gripZone = this.leftGripZone;
    this.rightHandGrip.gripZone = this.rightGripZone;

    console.log("GripSystem: Grip zones initialized");
  }

  /**
   * Add event listener
   */
  addEventListener(type: GripEventType, listener: GripEventListener): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.push(listener);
    }
  }

  /**
   * Remove event listener
   */
  removeEventListener(type: GripEventType, listener: GripEventListener): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to listeners
   */
  private emitEvent(event: GripEvent): void {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        listener(event);
      }
    }
  }

  /**
   * Update grip system each frame
   */
  update(): void {
    // Get controller references
    const leftController = this.context.xrInput._leftHandController;
    const rightController = this.context.xrInput._rightHandController;

    // Update grip zones if available
    if (this.leftGripZone && leftController) {
      this.updateHandGrip(
        this.leftHandGrip,
        this.leftGripZone,
        leftController,
        "left"
      );
    }

    if (this.rightGripZone && rightController) {
      this.updateHandGrip(
        this.rightHandGrip,
        this.rightGripZone,
        rightController,
        "right"
      );
    }
  }

  /**
   * Update grip state for a single hand
   */
  private updateHandGrip(
    handGrip: HandGripData,
    gripZone: GripZone,
    controller: XrMechanicalControllerInput,
    handSide: "left" | "right"
  ): void {
    // Store previous frame state
    handGrip.wasNear = handGrip.isNear;
    handGrip.wasGripButtonPressed = handGrip.gripButtonPressed;

    // Get current grip button state (using squeeze/grip button)
    handGrip.gripButtonPressed = controller.squeeze;

    // Calculate distance to grip zone
    gripZone.marker.getWorldPosition(__gripWorldPos);
    controller.wristWPos; // Trigger refresh
    __tempVec.copy(controller._worldPosition);
    handGrip.distance = __tempVec.distanceTo(__gripWorldPos);

    // Determine if near grip zone
    handGrip.isNear = handGrip.distance < gripZone.proximityThreshold;

    // Handle state transitions
    const previousState = handGrip.state;

    // Determine new state
    if (handGrip.isNear) {
      if (handGrip.gripButtonPressed && handGrip.distance < gripZone.grabThreshold) {
        handGrip.state = GripState.GRIPPING;
      } else {
        handGrip.state = GripState.NEAR;
      }
    } else {
      handGrip.state = GripState.IDLE;
    }

    // Handle state change events
    this.handleStateTransition(handGrip, previousState, controller, handSide);

    // Update visual feedback
    this.updateVisualFeedback(handGrip, gripZone);
  }

  /**
   * Handle state transitions and emit events
   */
  private handleStateTransition(
    handGrip: HandGripData,
    previousState: GripState,
    controller: XrMechanicalControllerInput,
    handSide: "left" | "right"
  ): void {
    const currentState = handGrip.state;

    // Entered proximity (IDLE -> NEAR or IDLE -> GRIPPING)
    if (previousState === GripState.IDLE && currentState !== GripState.IDLE) {
      // Haptic pulse on entering grip zone
      controller.vibrate(0.3, 50);

      this.emitEvent({
        type: "enterProximity",
        hand: handSide,
        distance: handGrip.distance,
      });
    }

    // Exited proximity (NEAR or GRIPPING -> IDLE)
    if (previousState !== GripState.IDLE && currentState === GripState.IDLE) {
      // Light haptic on leaving grip zone
      controller.vibrate(0.1, 30);

      this.emitEvent({
        type: "exitProximity",
        hand: handSide,
        distance: handGrip.distance,
      });
    }

    // Started gripping (any state -> GRIPPING)
    if (previousState !== GripState.GRIPPING && currentState === GripState.GRIPPING) {
      // Strong haptic on successful grip
      controller.vibrate(0.6, 100);

      this.emitEvent({
        type: "gripStart",
        hand: handSide,
        distance: handGrip.distance,
      });
    }

    // Stopped gripping (GRIPPING -> any other state)
    if (previousState === GripState.GRIPPING && currentState !== GripState.GRIPPING) {
      // Medium haptic on release
      controller.vibrate(0.4, 50);

      this.emitEvent({
        type: "gripEnd",
        hand: handSide,
        distance: handGrip.distance,
      });
    }
  }

  /**
   * Update visual feedback on grip markers
   */
  private updateVisualFeedback(handGrip: HandGripData, gripZone: GripZone): void {
    const marker = gripZone.marker;

    switch (handGrip.state) {
      case GripState.IDLE:
        // Dim green when not in range
        marker.material = this.normalMaterial;
        marker.scale.setScalar(1.0);
        break;

      case GripState.NEAR:
        // Bright green glow when in range
        marker.material = this.highlightMaterial;
        // Pulse scale based on distance (closer = larger)
        const proximityFactor = 1 - (handGrip.distance / gripZone.proximityThreshold);
        marker.scale.setScalar(1.0 + proximityFactor * 0.3);
        break;

      case GripState.GRIPPING:
        // Yellow glow when gripping
        marker.material = this.grippingMaterial;
        marker.scale.setScalar(1.2);
        break;
    }
  }

  /**
   * Check if a specific hand is gripping
   */
  isHandGripping(hand: "left" | "right"): boolean {
    const handGrip = hand === "left" ? this.leftHandGrip : this.rightHandGrip;
    return handGrip.state === GripState.GRIPPING;
  }

  /**
   * Check if both hands are gripping
   */
  areBothHandsGripping(): boolean {
    return this.isHandGripping("left") && this.isHandGripping("right");
  }

  /**
   * Check if a specific hand is near its grip zone
   */
  isHandNearGrip(hand: "left" | "right"): boolean {
    const handGrip = hand === "left" ? this.leftHandGrip : this.rightHandGrip;
    return handGrip.state === GripState.NEAR || handGrip.state === GripState.GRIPPING;
  }

  /**
   * Get the distance from a hand to its grip zone
   */
  getHandDistanceToGrip(hand: "left" | "right"): number {
    const handGrip = hand === "left" ? this.leftHandGrip : this.rightHandGrip;
    return handGrip.distance;
  }

  /**
   * Get current grip state for a hand
   */
  getHandGripState(hand: "left" | "right"): GripState {
    const handGrip = hand === "left" ? this.leftHandGrip : this.rightHandGrip;
    return handGrip.state;
  }

  /**
   * Get debug info for display
   */
  getDebugInfo(): string {
    const leftState = this.leftHandGrip.state;
    const rightState = this.rightHandGrip.state;
    const leftDist = this.leftHandGrip.distance.toFixed(3);
    const rightDist = this.rightHandGrip.distance.toFixed(3);

    return `L: ${leftState} (${leftDist}m) | R: ${rightState} (${rightDist}m)`;
  }
}
