# bmXr MVP Implementation Plan

## Project Overview
Create a first-person BMX VR game using Three.js and WebXR with skill-based mechanics that parallel real-life BMX trick execution.

## Current State Assessment
- ✅ Basic Three.js scene setup with WebXR support
- ✅ VR button and XR session handling
- ✅ XR input system with controller tracking
- ✅ Handlebar 3D model loading
- ✅ Basic scene (ground, lighting, grid helpers)
- ✅ Development environment (Vite + TypeScript)

## MVP Goal
A working VR experience where the user can:
1. Enter VR mode and see from a first-person BMX rider perspective
2. Hold virtual handlebars with VR controllers
3. Perform a basic barspin trick using timed controller inputs
4. Get visual/haptic feedback for successful trick execution

---

## Phase 1: Core VR Experience Setup

### Step 1.1: Fix VR Camera Perspective ✅
**Goal:** Position camera at proper first-person BMX rider height and angle

**Tasks:**
- [x] Update camera initial position to rider's head height (approximately 1.5-1.8m when standing, adjust for seated/BMX position)
- [x] Create camera rig that represents the rider's body position on BMX
- [x] Add camera height adjustment based on VR session start
- [x] Test camera position feels natural in VR headset (ready for user testing)

**Files modified:**
- `src/context.ts` - Updated camera initialization and position, added camera rig, VR session listeners

**Implementation notes:**
- Camera positioned at 1.3m height (BMX riding position)
- Created `cameraRig` Group to represent rider's body position
- Added VR session event listeners that adjust camera on VR entry/exit
- Desktop mode uses OrbitControls for debugging (disabled in VR)
- Camera resets to origin in VR mode (WebXR handles head tracking)

**Acceptance criteria:**
- ✅ User sees scene from appropriate BMX rider perspective
- ✅ Camera height matches typical VR user standing/riding position

---

### Step 1.2: Handlebar Positioning & Scale
**Goal:** Position handlebars in natural reach of VR controllers

**Tasks:**
- [ ] Position handlebars relative to camera/rider position
- [ ] Scale handlebars to realistic BMX handlebar size (approximately 60-70cm wide)
- [ ] Add handlebar grips at appropriate positions for controller attachment
- [ ] Create visual markers on handlebars showing where to "grab"
- [ ] Test handlebar position is comfortable in VR

**Files to modify:**
- `src/context.ts` - Update handlebar positioning in `buildScene()` and `onAnimate()`
- Consider creating `src/entities/Handlebars.ts` for handlebar-specific logic

**Acceptance criteria:**
- Handlebars appear at natural arm's reach in VR
- Scale is realistic to actual BMX handlebars
- Grip positions are clearly visible

---

### Step 1.3: Controller Visualization
**Goal:** Show VR controllers in scene with visual feedback

**Tasks:**
- [ ] Add controller mesh/models to scene (can use simple spheres or cylinders initially)
- [ ] Track controller position and rotation in real-time
- [ ] Implement controller ray/pointer for debugging
- [ ] Add visual state changes (color/glow) when near handlebars
- [ ] Display controller button states for debugging

**Files to modify:**
- `src/utils/xrInput.ts` - Enhance controller visualization
- `src/utils/xrMechanicalControllerInput.ts` - Add visual feedback

**Acceptance criteria:**
- Controllers visible in VR matching real controller positions
- Visual feedback when controllers near interactive objects
- Can see which buttons are pressed (for debugging)

---

## Phase 2: Handlebar Grip System

### Step 2.1: Grip Detection
**Goal:** Detect when controllers are in position to grip handlebars

**Tasks:**
- [ ] Define grip zones on left and right handlebar
- [ ] Implement proximity detection between controllers and grip zones
- [ ] Add "haptic pulse" feedback when entering grip zone
- [ ] Create visual highlight when grip is available
- [ ] Implement grip button mapping (trigger or grip button)

**Files to modify:**
- Create `src/mechanics/GripSystem.ts`
- `src/utils/xrInput.ts` - Add grip detection events
- `src/context.ts` - Integrate grip system

**Acceptance criteria:**
- System detects when controller is within 5-10cm of grip point
- Haptic feedback pulses when in range
- Visual indicator shows grippable state

---

### Step 2.2: Grip Attachment
**Goal:** Attach controllers to handlebars when grip button pressed

**Tasks:**
- [ ] Implement grip button listener (squeeze/trigger)
- [ ] Create parent-child relationship between controller and handlebar grip point
- [ ] Lock controller to handlebar when gripped
- [ ] Add stronger haptic feedback on successful grip
- [ ] Implement grip release on button release
- [ ] Track which hand is gripping which side

**Files to modify:**
- `src/mechanics/GripSystem.ts`
- `src/utils/xrInput.ts`

**Acceptance criteria:**
- Pressing grip button when in range attaches controller to handlebar
- Controller position locked to handlebar while gripping
- Release works smoothly
- Can grip/release independently with each hand

---

### Step 2.3: Handlebar Control
**Goal:** Handlebars rotate based on controller movement when gripped

**Tasks:**
- [ ] Calculate handlebar rotation based on controller positions
- [ ] Implement handlebar pivot point (stem/center)
- [ ] Add rotation constraints (realistic handlebar movement limits)
- [ ] Smooth interpolation for handlebar movement
- [ ] Test handlebar steering feels natural

**Files to modify:**
- `src/mechanics/GripSystem.ts`
- `src/entities/Handlebars.ts`
- `src/context.ts` - Update handlebar rotation in animation loop

**Acceptance criteria:**
- Handlebars rotate when both hands gripped and controllers move
- Movement feels natural and responsive
- Rotation limited to realistic range (±90 degrees)

---

## Phase 3: Barspin Mechanic

### Step 3.1: Barspin State Machine
**Goal:** Create state system for barspin trick execution

**Tasks:**
- [ ] Define barspin states: READY, INITIATED, SPINNING, CATCH_WINDOW, CAUGHT, FAILED
- [ ] Implement state transitions with validation
- [ ] Add state debugging visualization
- [ ] Create state event emitters for feedback systems

**Files to create:**
- `src/mechanics/BarspinMechanic.ts`

**States:**
- **READY**: Both hands gripping, ready to start
- **INITIATED**: One hand released, rotation started
- **SPINNING**: Both hands released, bars spinning freely
- **CATCH_WINDOW**: Brief time window when catches are possible
- **CAUGHT**: Successful catch(es) made
- **FAILED**: Missed timing or incorrect execution

**Acceptance criteria:**
- State machine handles all barspin phases
- Clear state transitions with validation
- States can be visualized for debugging

---

### Step 3.2: Barspin Initiation
**Goal:** Detect rotation gesture to start barspin

**Tasks:**
- [ ] Track controller angular velocity when one hand gripped
- [ ] Detect rotation gesture threshold (minimum rotation speed)
- [ ] Calculate spin direction from controller movement
- [ ] Trigger barspin animation on second hand release
- [ ] Add visual/haptic feedback on successful initiation

**Files to modify:**
- `src/mechanics/BarspinMechanic.ts`
- `src/utils/xrGestureTracker.ts` - Track rotation gestures

**Acceptance criteria:**
- System detects when user rotates gripped controller
- Requires minimum rotation speed to initiate (prevents accidental triggers)
- Spin direction matches controller rotation direction
- Clear feedback when barspin initiated

---

### Step 3.3: Barspin Animation
**Goal:** Animate handlebars spinning after initiation

**Tasks:**
- [ ] Calculate spin speed based on initiation velocity
- [ ] Implement handlebar rotation animation (360-degree spin)
- [ ] Add physics-based deceleration (optional for MVP)
- [ ] Track rotation angle throughout spin
- [ ] Support multiple rotations (180, 360, 540, etc.)

**Files to modify:**
- `src/mechanics/BarspinMechanic.ts`
- `src/context.ts` - Update animation loop

**Acceptance criteria:**
- Handlebars spin smoothly based on initiation force
- Spin speed feels realistic
- Can track exactly where handlebars are in rotation

---

### Step 3.4: Barspin Catch Detection
**Goal:** Detect successful catch timing

**Tasks:**
- [ ] Define catch windows (when grips are in correct position)
- [ ] Calculate grip position relative to controller position during spin
- [ ] Detect grip button press during catch window
- [ ] Implement first and second catch separately
- [ ] Allow margin of error (±20-30 degrees for MVP)
- [ ] Provide visual indicator of catch windows

**Files to modify:**
- `src/mechanics/BarspinMechanic.ts`
- `src/utils/xrInput.ts`

**Acceptance criteria:**
- System detects when grip passes near controller
- Catch window is forgiving enough for beginners
- Visual indicator shows when to press grip button
- Both catches must be completed for full success

---

### Step 3.5: Barspin Feedback System
**Goal:** Provide clear feedback for trick execution

**Tasks:**
- [ ] Implement haptic patterns:
  - Light pulse during catch windows
  - Strong pulse on successful catch
  - Different pattern on failed catch
- [ ] Add visual feedback:
  - Glow/highlight during catch windows
  - Success particle effect or color flash
  - Failure indicator (red flash, etc.)
- [ ] Add audio feedback (optional for MVP):
  - Swoosh sound during spin
  - Click/snap on successful catch
  - Miss sound on failure
- [ ] Create success/failure UI display

**Files to modify:**
- `src/mechanics/BarspinMechanic.ts`
- Create `src/feedback/HapticFeedback.ts`
- Create `src/feedback/VisualFeedback.ts`

**Acceptance criteria:**
- Clear haptic feedback for each stage
- Visual indicators are easy to understand
- User knows immediately if trick succeeded or failed

---

## Phase 4: Environment & Polish

### Step 4.1: Basic Skatepark Environment
**Goal:** Create minimal environment for context

**Tasks:**
- [ ] Expand ground plane to feel like outdoor space
- [ ] Add simple ramps or quarter pipes (basic geometry)
- [ ] Implement sky gradient or skybox
- [ ] Add basic lighting improvements (ambient + directional)
- [ ] Position environmental elements around player

**Files to modify:**
- `src/context.ts` - Expand `buildScene()`
- Consider creating `src/environment/Skatepark.ts`

**Acceptance criteria:**
- Scene feels like BMX/skate environment
- Enough visual context to not feel empty
- Performance remains smooth (60+ FPS in VR)

---

### Step 4.2: Simple BMX Model
**Goal:** Add visible BMX bike for immersion

**Tasks:**
- [ ] Create or import simple BMX 3D model
- [ ] Position BMX relative to camera (below/in front)
- [ ] Attach handlebars to BMX frame
- [ ] Ensure bike doesn't obstruct view
- [ ] Add basic materials/colors

**Files to modify:**
- Create `src/entities/BMX.ts`
- `src/context.ts` - Add BMX to scene

**Acceptance criteria:**
- BMX visible in peripheral vision
- Handlebars connected properly to bike
- Doesn't interfere with gameplay
- Adds to immersion

---

### Step 4.3: Performance Optimization
**Goal:** Ensure smooth 60+ FPS in VR

**Tasks:**
- [ ] Review and optimize render loop
- [ ] Implement object pooling for reusable objects
- [ ] Optimize materials (reduce reflections, use simpler shaders)
- [ ] Implement level-of-detail (LOD) if needed
- [ ] Profile and identify bottlenecks
- [ ] Test on target VR hardware (Meta Quest, etc.)

**Files to modify:**
- All files - general optimization
- `src/context.ts` - Renderer settings

**Acceptance criteria:**
- Maintains 72+ FPS on Meta Quest 2
- Maintains 90+ FPS on PCVR
- No noticeable stuttering or frame drops

---

### Step 4.4: UI & Tutorial
**Goal:** Help users understand controls

**Tasks:**
- [ ] Create VR-space UI panel showing controls
- [ ] Add text labels for grip points
- [ ] Create tutorial sequence:
  1. "Grip both handles"
  2. "Release right handle"
  3. "Rotate left hand"
  4. "Release left handle"
  5. "Press grip to catch"
- [ ] Add optional practice mode with visual guides
- [ ] Create reset/restart functionality

**Files to create:**
- `src/ui/TutorialSystem.ts`
- `src/ui/VRUIPanel.ts`

**Acceptance criteria:**
- New users can understand controls without external documentation
- Tutorial can be skipped for experienced users
- Clear visual guidance during learning

---

## Phase 5: Testing & Refinement

### Step 5.1: Core Mechanic Testing
**Goal:** Ensure barspin mechanic is fun and learnable

**Tasks:**
- [ ] Test with multiple users
- [ ] Gather feedback on difficulty
- [ ] Adjust catch window timing
- [ ] Tune haptic feedback strength
- [ ] Balance challenge vs. accessibility
- [ ] Document common issues

**Acceptance criteria:**
- 80%+ of testers can complete barspin within 5 minutes
- Mechanic feels skill-based but achievable
- Feedback is clear and helpful

---

### Step 5.2: VR Comfort & Safety
**Goal:** Ensure comfortable VR experience

**Tasks:**
- [ ] Test for motion sickness triggers
- [ ] Ensure camera never moves unexpectedly
- [ ] Add comfort mode options if needed
- [ ] Test play sessions of 15+ minutes
- [ ] Add play area boundary awareness
- [ ] Ensure proper frame rate is maintained

**Acceptance criteria:**
- No reports of motion sickness
- Comfortable for extended play
- Safe movement within play space

---

### Step 5.3: Bug Fixes & Polish
**Goal:** Clean up remaining issues

**Tasks:**
- [ ] Fix any controller tracking edge cases
- [ ] Handle VR session interruptions gracefully
- [ ] Add proper error handling and fallbacks
- [ ] Clean up debug visualizations
- [ ] Optimize loading times
- [ ] Add loading screen for VR session

**Acceptance criteria:**
- No critical bugs
- Graceful handling of edge cases
- Professional presentation

---

## Phase 6: Deployment Preparation

### Step 6.1: Build Optimization
**Goal:** Optimize production build

**Tasks:**
- [ ] Configure Vite for production build
- [ ] Optimize asset loading (compress textures, models)
- [ ] Implement asset preloading
- [ ] Minify JavaScript bundle
- [ ] Test production build in VR

**Files to modify:**
- `vite.config.js`
- Add asset optimization pipeline

**Acceptance criteria:**
- Production build loads quickly
- All assets optimized for size
- VR performance maintained

---

### Step 6.2: Documentation
**Goal:** Document setup and gameplay

**Tasks:**
- [ ] Update README with setup instructions
- [ ] Document VR hardware requirements
- [ ] Add troubleshooting guide
- [ ] Document controls and mechanics
- [ ] Add development setup guide
- [ ] Create demo video/screenshots

**Files to create/modify:**
- `README.md`
- `CONTROLS.md`
- `TROUBLESHOOTING.md`

**Acceptance criteria:**
- Clear setup instructions
- All controls documented
- Common issues have solutions

---

### Step 6.3: Hosting & Distribution
**Goal:** Make accessible to testers/users

**Tasks:**
- [ ] Set up HTTPS hosting (required for WebXR)
- [ ] Configure proper MIME types for .glb/.gltf files
- [ ] Test on multiple VR platforms:
  - Meta Quest (browser)
  - PCVR (Chrome/Edge)
  - Other WebXR-compatible browsers
- [ ] Create shareable demo link
- [ ] Consider itch.io or similar platform for distribution

**Acceptance criteria:**
- Accessible via HTTPS URL
- Works on target VR platforms
- Easy to share and test

---

## Success Metrics for MVP

### Technical Metrics
- [ ] Maintains 72+ FPS on Meta Quest 2
- [ ] Maintains 90+ FPS on PCVR
- [ ] Loads in under 10 seconds
- [ ] No critical bugs or crashes
- [ ] Controllers track accurately

### User Experience Metrics
- [ ] 80%+ of testers can complete barspin within 5 minutes
- [ ] 90%+ understand controls without help after tutorial
- [ ] No motion sickness reports
- [ ] Positive feedback on "feel" of mechanic

### Feature Completeness
- [ ] Full VR mode functional
- [ ] Barspin mechanic complete with all states
- [ ] Visual and haptic feedback working
- [ ] Tutorial/guidance system present
- [ ] Basic environment present
- [ ] Works on target hardware

---

## Post-MVP Roadmap

### Future Enhancements (Not in MVP)
1. **Additional Tricks**
   - Tailwhip
   - 360/180 spins
   - Grinds
   - Manuals

2. **Advanced Features**
   - Movement/riding system
   - Physics-based bike handling
   - Trick combinations
   - Scoring system
   - Multiplayer/ghost riders

3. **Visual Polish**
   - South Park aesthetic implementation
   - Advanced materials and lighting
   - Particle effects
   - Better bike and environment models

4. **Audio**
   - Background music
   - Trick sound effects
   - Ambient environment sounds
   - Voice feedback

---

## Development Tips

### Testing Strategy
- Test in VR headset frequently (at least daily)
- Use desktop mode for quick iteration
- Keep debug visualizations toggleable
- Test with different controller types

### Common Pitfalls to Avoid
- Don't optimize prematurely - get it working first
- Test VR comfort early and often
- Keep controller tracking simple initially
- Start with forgiving timing windows
- Document assumptions and magic numbers

### Recommended Development Order
1. Get camera position feeling right
2. Make handlebars grabbable
3. Implement basic rotation
4. Add barspin state machine
5. Polish feedback and timing
6. Add environment and visuals

---

## Resources & References

### Three.js WebXR Documentation
- https://threejs.org/docs/#manual/en/introduction/How-to-create-VR-content

### WebXR API
- https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API

### VR Design Best Practices
- https://developer.oculus.com/resources/bp-intro/

### Similar Projects for Reference
- Skate 3 mechanics analysis
- Other WebXR games
- BMX trick tutorials (for real-world reference)

---

## Estimated Timeline

**Phase 1: Core VR Experience** - 3-5 days
**Phase 2: Handlebar Grip System** - 5-7 days
**Phase 3: Barspin Mechanic** - 7-10 days
**Phase 4: Environment & Polish** - 3-5 days
**Phase 5: Testing & Refinement** - 5-7 days
**Phase 6: Deployment** - 2-3 days

**Total Estimated Time: 25-37 days** (for a single developer working full-time)

Adjust timeline based on:
- Prior Three.js/WebXR experience
- Access to VR hardware for testing
- Scope adjustments
- Testing feedback requirements

---

## Notes

- This plan prioritizes getting a **working, playable MVP** over perfect execution
- Each phase builds on the previous one - don't skip ahead
- Test frequently in actual VR hardware
- Be prepared to adjust based on what feels good in VR vs. on paper
- The barspin mechanic should be fun and learnable - this is the core loop
- Performance in VR is non-negotiable - maintain frame rate at all costs

Good luck building your VR BMX experience!
