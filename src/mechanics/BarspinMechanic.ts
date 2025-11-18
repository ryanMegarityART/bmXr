import * as THREE from "three";
import { Context } from "../context";
import { GripSystem } from "./GripSystem";

/**
 * Barspin trick states
 */
export enum BarspinState {
  READY = "READY",           // Both hands gripping, ready to start
  INITIATED = "INITIATED",   // One hand released, rotation started
  SPINNING = "SPINNING",     // Both hands released, bars spinning freely
  CATCH_WINDOW = "CATCH_WINDOW", // Brief time window when catches are possible
  CAUGHT = "CAUGHT",         // Successful catch(es) made
  FAILED = "FAILED",         // Missed timing or incorrect execution
}

/**
 * Events emitted by the BarspinMechanic
 */
export type BarspinEventType =
  | "stateChange"      // State has changed
  | "initiated"        // Barspin initiated (one hand released with rotation)
  | "spinning"         // Both hands released, spinning started
  | "catchWindowOpen"  // Catch window is now available
  | "catchWindowClose" // Catch window closed
  | "firstCatch"       // First hand caught
  | "secondCatch"      // Second hand caught (success)
  | "success"          // Full barspin completed successfully
  | "failed";          // Barspin failed

export interface BarspinEvent {
  type: BarspinEventType;
  previousState?: BarspinState;
  currentState: BarspinState;
  spinDirection?: "clockwise" | "counterclockwise";
  spinProgress?: number; // 0-1 representing rotation progress
  hand?: "left" | "right";
}

type BarspinEventListener = (event: BarspinEvent) => void;

/**
 * Configuration for barspin mechanic
 */
export interface BarspinConfig {
  // Initiation thresholds
  minRotationVelocity: number;    // Minimum angular velocity to initiate (rad/s)
  initiationTimeout: number;       // Time after first release to initiate (ms)

  // Catch window timing
  catchWindowDuration: number;     // Duration of catch window (ms)
  catchWindowAngleMargin: number;  // Angular margin for successful catch (radians)

  // Reset timing
  failureResetDelay: number;       // Delay before reset after failure (ms)
  successResetDelay: number;       // Delay before reset after success (ms)
}

/**
 * BarspinMechanic manages the barspin trick state machine.
 *
 * Flow:
 * 1. READY - Both hands gripping
 * 2. INITIATED - One hand releases, rotation detected
 * 3. SPINNING - Both hands released, handlebar spinning
 * 4. CATCH_WINDOW - Time to catch the bars
 * 5. CAUGHT/FAILED - Result of the attempt
 */
export class BarspinMechanic {
  context: Context;
  gripSystem: GripSystem;

  // Current state
  private _state: BarspinState = BarspinState.READY;
  private previousState: BarspinState = BarspinState.READY;

  // Spin tracking
  spinDirection: "clockwise" | "counterclockwise" | null = null;
  spinStartTime: number = 0;
  spinProgress: number = 0; // 0-1 representing rotation completion
  currentRotation: number = 0; // Current handlebar rotation in radians
  targetRotation: number = Math.PI * 2; // Full 360 spin

  // Initiation tracking
  initiatingHand: "left" | "right" | null = null;
  initiationStartTime: number = 0;

  // Catch tracking
  catchWindowStartTime: number = 0;
  firstCatchHand: "left" | "right" | null = null;

  // Configuration
  config: BarspinConfig = {
    minRotationVelocity: 1.5,      // rad/s - adjustable for difficulty
    initiationTimeout: 500,        // 500ms to initiate after first release
    catchWindowDuration: 400,      // 400ms catch window - forgiving for MVP
    catchWindowAngleMargin: Math.PI / 6, // ±30 degrees margin
    failureResetDelay: 1500,       // 1.5s delay after failure
    successResetDelay: 2000,       // 2s delay after success
  };

  // Event listeners
  private listeners: Map<BarspinEventType, BarspinEventListener[]> = new Map();

  // Debug visualization
  private debugText: THREE.Sprite | null = null;
  private debugTextCanvas: HTMLCanvasElement | null = null;
  private debugTextContext: CanvasRenderingContext2D | null = null;

  // State colors for debug visualization
  private stateColors: Record<BarspinState, string> = {
    [BarspinState.READY]: "#00FF00",        // Green
    [BarspinState.INITIATED]: "#FFFF00",    // Yellow
    [BarspinState.SPINNING]: "#FF8800",     // Orange
    [BarspinState.CATCH_WINDOW]: "#00FFFF", // Cyan
    [BarspinState.CAUGHT]: "#00FF88",       // Teal
    [BarspinState.FAILED]: "#FF0000",       // Red
  };

  constructor(context: Context) {
    this.context = context;
    this.gripSystem = context.gripSystem;

    // Initialize event listener maps
    this.initializeEventListeners();

    // Setup grip system event listeners
    this.setupGripEventListeners();

    // Create debug visualization
    this.createDebugVisualization();
  }

  /**
   * Initialize event listener maps
   */
  private initializeEventListeners(): void {
    const eventTypes: BarspinEventType[] = [
      "stateChange",
      "initiated",
      "spinning",
      "catchWindowOpen",
      "catchWindowClose",
      "firstCatch",
      "secondCatch",
      "success",
      "failed",
    ];

    for (const type of eventTypes) {
      this.listeners.set(type, []);
    }
  }

  /**
   * Setup listeners for grip system events
   */
  private setupGripEventListeners(): void {
    // Listen for grip releases to detect barspin initiation
    this.gripSystem.addEventListener("gripEnd", (event) => {
      this.onGripReleased(event.hand);
    });

    // Listen for grip starts to detect catches
    this.gripSystem.addEventListener("gripStart", (event) => {
      this.onGripPressed(event.hand);
    });
  }

  /**
   * Create debug text sprite for state visualization
   */
  private createDebugVisualization(): void {
    // Create canvas for text
    this.debugTextCanvas = document.createElement("canvas");
    this.debugTextCanvas.width = 512;
    this.debugTextCanvas.height = 128;
    this.debugTextContext = this.debugTextCanvas.getContext("2d");

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(this.debugTextCanvas);
    texture.needsUpdate = true;

    // Create sprite material
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
    });

    // Create sprite
    this.debugText = new THREE.Sprite(material);
    this.debugText.scale.set(1.0, 0.25, 1);
    this.debugText.position.set(0, 0.3, -0.45); // Above handlebars

    // Add to camera rig so it moves with player
    this.context.cameraRig.add(this.debugText);

    // Initial render
    this.updateDebugVisualization();
  }

  /**
   * Update debug text visualization
   */
  private updateDebugVisualization(): void {
    if (!this.debugTextContext || !this.debugTextCanvas || !this.debugText) {
      return;
    }

    const ctx = this.debugTextContext;
    const canvas = this.debugTextCanvas;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // State text
    ctx.font = "bold 48px Arial";
    ctx.fillStyle = this.stateColors[this._state];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this._state, canvas.width / 2, canvas.height / 3);

    // Progress bar for spinning state
    if (this._state === BarspinState.SPINNING || this._state === BarspinState.CATCH_WINDOW) {
      const barWidth = canvas.width - 40;
      const barHeight = 20;
      const barX = 20;
      const barY = canvas.height - 40;

      // Background bar
      ctx.fillStyle = "#333333";
      ctx.fillRect(barX, barY, barWidth, barHeight);

      // Progress bar
      ctx.fillStyle = this.stateColors[this._state];
      ctx.fillRect(barX, barY, barWidth * this.spinProgress, barHeight);

      // Border
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2;
      ctx.strokeRect(barX, barY, barWidth, barHeight);
    }

    // Update texture
    const material = this.debugText.material as THREE.SpriteMaterial;
    if (material.map) {
      material.map.needsUpdate = true;
    }
  }

  /**
   * Get current state
   */
  get state(): BarspinState {
    return this._state;
  }

  /**
   * Set state with validation and event emission
   */
  private setState(newState: BarspinState): void {
    if (newState === this._state) {
      return;
    }

    // Validate state transition
    if (!this.isValidTransition(this._state, newState)) {
      console.warn(`Invalid barspin state transition: ${this._state} -> ${newState}`);
      return;
    }

    this.previousState = this._state;
    this._state = newState;

    console.log(`Barspin state: ${this.previousState} -> ${this._state}`);

    // Emit state change event
    this.emitEvent({
      type: "stateChange",
      previousState: this.previousState,
      currentState: this._state,
      spinDirection: this.spinDirection || undefined,
      spinProgress: this.spinProgress,
    });

    // Update debug visualization
    this.updateDebugVisualization();
  }

  /**
   * Validate if a state transition is allowed
   */
  private isValidTransition(from: BarspinState, to: BarspinState): boolean {
    const validTransitions: Record<BarspinState, BarspinState[]> = {
      [BarspinState.READY]: [BarspinState.INITIATED],
      [BarspinState.INITIATED]: [BarspinState.SPINNING, BarspinState.READY, BarspinState.FAILED],
      [BarspinState.SPINNING]: [BarspinState.CATCH_WINDOW, BarspinState.FAILED],
      [BarspinState.CATCH_WINDOW]: [BarspinState.CAUGHT, BarspinState.FAILED],
      [BarspinState.CAUGHT]: [BarspinState.READY], // Reset after success
      [BarspinState.FAILED]: [BarspinState.READY], // Reset after failure
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  /**
   * Add event listener
   */
  addEventListener(type: BarspinEventType, listener: BarspinEventListener): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.push(listener);
    }
  }

  /**
   * Remove event listener
   */
  removeEventListener(type: BarspinEventType, listener: BarspinEventListener): void {
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
  private emitEvent(event: BarspinEvent): void {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        listener(event);
      }
    }
  }

  /**
   * Handle grip release event
   */
  private onGripReleased(hand: "left" | "right"): void {
    switch (this._state) {
      case BarspinState.READY:
        // First hand released - potential initiation
        if (this.gripSystem.areBothHandsAttached() === false) {
          // Check if one hand is still gripping
          const otherHand = hand === "left" ? "right" : "left";
          if (this.gripSystem.isHandAttached(otherHand)) {
            this.initiatingHand = hand;
            this.initiationStartTime = performance.now();
            this.setState(BarspinState.INITIATED);

            this.emitEvent({
              type: "initiated",
              currentState: this._state,
              hand: hand,
            });
          }
        }
        break;

      case BarspinState.INITIATED:
        // Second hand released - start spinning
        this.spinStartTime = performance.now();
        this.spinProgress = 0;
        this.currentRotation = 0;
        // Spin direction determined by which hand initiated
        this.spinDirection = this.initiatingHand === "right" ? "clockwise" : "counterclockwise";

        this.setState(BarspinState.SPINNING);

        this.emitEvent({
          type: "spinning",
          currentState: this._state,
          spinDirection: this.spinDirection,
        });
        break;
    }
  }

  /**
   * Handle grip press event
   */
  private onGripPressed(hand: "left" | "right"): void {
    switch (this._state) {
      case BarspinState.INITIATED:
        // Re-gripped before spinning - cancel
        this.resetToReady();
        break;

      case BarspinState.CATCH_WINDOW:
        // Attempting to catch
        if (this.firstCatchHand === null) {
          // First catch
          this.firstCatchHand = hand;

          this.emitEvent({
            type: "firstCatch",
            currentState: this._state,
            hand: hand,
            spinProgress: this.spinProgress,
          });

          // Check if second catch follows quickly (both hands catch)
          // For MVP, we'll check in update loop
        } else if (this.firstCatchHand !== hand) {
          // Second hand caught - success!
          this.setState(BarspinState.CAUGHT);

          this.emitEvent({
            type: "secondCatch",
            currentState: this._state,
            hand: hand,
            spinProgress: this.spinProgress,
          });

          this.emitEvent({
            type: "success",
            currentState: this._state,
            spinDirection: this.spinDirection || undefined,
            spinProgress: this.spinProgress,
          });

          // Schedule reset
          setTimeout(() => {
            this.resetToReady();
          }, this.config.successResetDelay);
        }
        break;
    }
  }

  /**
   * Update method called each frame
   */
  update(deltaTime: number): void {
    switch (this._state) {
      case BarspinState.READY:
        this.updateReadyState();
        break;

      case BarspinState.INITIATED:
        this.updateInitiatedState();
        break;

      case BarspinState.SPINNING:
        this.updateSpinningState(deltaTime);
        break;

      case BarspinState.CATCH_WINDOW:
        this.updateCatchWindowState(deltaTime);
        break;
    }

    // Update debug visualization each frame when spinning
    if (this._state === BarspinState.SPINNING || this._state === BarspinState.CATCH_WINDOW) {
      this.updateDebugVisualization();
    }
  }

  /**
   * Update READY state
   */
  private updateReadyState(): void {
    // In READY state, we're just waiting for both hands to grip
    // The state transition happens via grip events
  }

  /**
   * Update INITIATED state
   */
  private updateInitiatedState(): void {
    const elapsed = performance.now() - this.initiationStartTime;

    // Check for timeout
    if (elapsed > this.config.initiationTimeout) {
      // Failed to complete initiation in time
      this.setState(BarspinState.FAILED);

      this.emitEvent({
        type: "failed",
        currentState: this._state,
      });

      // Schedule reset
      setTimeout(() => {
        this.resetToReady();
      }, this.config.failureResetDelay);
    }
  }

  /**
   * Update SPINNING state
   */
  private updateSpinningState(deltaTime: number): void {
    // Update spin progress
    // For MVP, we'll use time-based progress (can add physics later)
    const spinDuration = 600; // 600ms for full spin (adjustable)
    const elapsed = performance.now() - this.spinStartTime;

    this.spinProgress = Math.min(elapsed / spinDuration, 1.0);
    this.currentRotation = this.spinProgress * this.targetRotation;

    // Check if we should enter catch window
    // Catch window starts when bars are about 80% through rotation
    if (this.spinProgress >= 0.8) {
      this.catchWindowStartTime = performance.now();
      this.setState(BarspinState.CATCH_WINDOW);

      this.emitEvent({
        type: "catchWindowOpen",
        currentState: this._state,
        spinProgress: this.spinProgress,
      });
    }
  }

  /**
   * Update CATCH_WINDOW state
   */
  private updateCatchWindowState(deltaTime: number): void {
    const elapsed = performance.now() - this.catchWindowStartTime;

    // Continue updating spin progress
    const spinDuration = 600;
    const totalElapsed = performance.now() - this.spinStartTime;
    this.spinProgress = Math.min(totalElapsed / spinDuration, 1.0);
    this.currentRotation = this.spinProgress * this.targetRotation;

    // Check if catch window expired
    if (elapsed > this.config.catchWindowDuration) {
      this.emitEvent({
        type: "catchWindowClose",
        currentState: this._state,
        spinProgress: this.spinProgress,
      });

      // Failed to catch in time
      this.setState(BarspinState.FAILED);

      this.emitEvent({
        type: "failed",
        currentState: this._state,
        spinProgress: this.spinProgress,
      });

      // Schedule reset
      setTimeout(() => {
        this.resetToReady();
      }, this.config.failureResetDelay);
    }
  }

  /**
   * Reset state machine to READY
   */
  resetToReady(): void {
    this._state = BarspinState.READY;
    this.previousState = BarspinState.READY;
    this.spinDirection = null;
    this.spinStartTime = 0;
    this.spinProgress = 0;
    this.currentRotation = 0;
    this.initiatingHand = null;
    this.initiationStartTime = 0;
    this.catchWindowStartTime = 0;
    this.firstCatchHand = null;

    this.updateDebugVisualization();

    console.log("Barspin mechanic reset to READY");
  }

  /**
   * Check if barspin can be initiated
   */
  canInitiate(): boolean {
    return this._state === BarspinState.READY && this.gripSystem.areBothHandsAttached();
  }

  /**
   * Check if currently spinning
   */
  isSpinning(): boolean {
    return this._state === BarspinState.SPINNING || this._state === BarspinState.CATCH_WINDOW;
  }

  /**
   * Check if in catch window
   */
  isInCatchWindow(): boolean {
    return this._state === BarspinState.CATCH_WINDOW;
  }

  /**
   * Get current spin rotation in radians
   */
  getSpinRotation(): number {
    return this.currentRotation;
  }

  /**
   * Get debug info string
   */
  getDebugInfo(): string {
    let info = `Barspin: ${this._state}`;

    if (this._state === BarspinState.SPINNING || this._state === BarspinState.CATCH_WINDOW) {
      info += ` (${(this.spinProgress * 100).toFixed(0)}%)`;
    }

    if (this.spinDirection) {
      info += ` [${this.spinDirection}]`;
    }

    return info;
  }

  /**
   * Show/hide debug visualization
   */
  setDebugVisible(visible: boolean): void {
    if (this.debugText) {
      this.debugText.visible = visible;
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.debugText) {
      this.context.cameraRig.remove(this.debugText);
      const material = this.debugText.material as THREE.SpriteMaterial;
      if (material.map) {
        material.map.dispose();
      }
      material.dispose();
    }

    this.listeners.clear();
  }
}
