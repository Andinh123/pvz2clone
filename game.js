// Function to load JSON animation data
const LerpModes = {
    // Linear interpolation
    linear: (p0, p1, p2, p3, t) => {
        // For linear, we only use p1 and p2
        if (Array.isArray(p1)) {
            return p1.map((start, i) => start + (p2[i] - start) * t);
        }
        return p1 + (p2 - p1) * t;
    },

    // Catmull-Rom spline interpolation
    catmullrom: (p0, p1, p2, p3, t) => {
        const t2 = t * t;
        const t3 = t2 * t;

        // Catmull-Rom coefficients
        const c0 = -0.5 * t3 + t2 - 0.5 * t;
        const c1 = 1.5 * t3 - 2.5 * t2 + 1.0;
        const c2 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
        const c3 = 0.5 * t3 - 0.5 * t2;

        if (Array.isArray(p1)) {
            return p1.map((_, i) => {
                // Handle edge cases where p0 or p3 might not exist
                const v0 = p0 ? p0[i] : p1[i];
                const v3 = p3 ? p3[i] : p2[i];
                
                return c0 * v0 + c1 * p1[i] + c2 * p2[i] + c3 * v3;
            });
        }

        // Handle edge cases for scalar values
        const v0 = p0 ?? p1;
        const v3 = p3 ?? p2;
        
        return c0 * v0 + c1 * p1 + c2 * p2 + c3 * v3;
    }
};
function loadAnimationData(path) {
    return fetch(path)
        .then(response => response.json())
        .catch(error => console.error("Error loading animation data:", error));
}

// Animation Controller for custom SVG animations
class AnimationController {
    constructor(container, svgPath, animationData, scale = 0.8) {
        this.container = container;
        this.animations = animationData.animations;
        this.svgPath = svgPath;
        this.scale = scale;
        
        // Separate timing for different animation types
        this.animationTimes = {
            loop: 0,
            event: 0
        };
        
        // Master animation state to aggregate transformations
        this.masterAnimation = {};

        this.activeAnimations = {
            loop: null,
            event: null
        };

        this.addTime = performance.now(); // Store the time when this AnimationController was created

        this.loadSVG().then(() => {
            this.play('loop');
        });
    }

    calculateAnimationDuration(animation) {
        let maxDuration = 0;
        if (animation.group) {
            for (const groupData of Object.values(animation.group)) {
                for (const transform of Object.values(groupData)) {
                    // Assuming animations are defined for a specific duration
                    // You might need to adjust this based on your animation expressions
                    maxDuration = Math.max(maxDuration, 2000); // Default to 2 seconds if cannot determine
                }
            }
        }
        return maxDuration;
    }

    async loadSVG() {
        const response = await fetch(this.svgPath);
        const svgText = await response.text();
        this.container.innerHTML = svgText;

        const svgElement = this.container.querySelector('svg');
        if (svgElement) {
            svgElement.style.transform = `scale(${this.scale})`;
            svgElement.style.transformOrigin = 'bottom center';
            svgElement.style.marginTop = "1.2vw";
        }
    }

    play(animationKey, startTime = performance.now()) {
        if (!this.animations || !this.animations[animationKey]) {
            console.error(`Animation "${animationKey}" not found.`);
            return;
        }
    
        if (animationKey === 'loop') {
            this.activeAnimations.loop = this.animations[animationKey];
            this.animationTimes.loop = startTime - this.addTime; // Use relative time
        } else if (animationKey === 'produce') {
            // Only start produce animation if no event animation is currently playing
            if (!this.activeAnimations.event) {
                this.activeAnimations.event = this.animations[animationKey];
                this.animationTimes.event = startTime - this.addTime; // Use relative time
                console.log(`Started "produce" animation`);
            }
        }
    
        if (!this.isAnimating) {
            this.isAnimating = true;
            requestAnimationFrame(this.animate.bind(this));
        }
    }

    animate(timestamp) {
        let shouldContinue = false;

        this.resetMasterAnimation();
    
        // Handle loop animation
        if (this.activeAnimations.loop) {
            const loopElapsed = (timestamp - this.animationTimes.loop) / 1000; // Use relative time
            this.updateMasterAnimation(this.activeAnimations.loop, loopElapsed);
            shouldContinue = true;
        }

        // Handle event animation with proper duration from animation data
        if (this.activeAnimations.event) {
            const eventElapsed = (timestamp - this.animationTimes.event) / 1000; // Use relative time
            const duration = this.animations.produce.animation_length;
            
            if (eventElapsed < duration) {
                this.updateMasterAnimation(this.activeAnimations.event, eventElapsed);
                shouldContinue = true;
            } else {
                console.log("Produce animation complete");
                this.activeAnimations.event = null;
            }
        }
    
        this.applyMasterAnimation();

        if (shouldContinue) {
            requestAnimationFrame(this.animate.bind(this));
        } else {
            this.isAnimating = false;
        }
    }

    resetMasterAnimation() {
        this.masterAnimation = {};
        
        // Initialize groups that exist in any active animation
        for (const anim of Object.values(this.activeAnimations)) {
            if (anim && anim.group) {
                for (const groupId of Object.keys(anim.group)) {
                    if (!this.masterAnimation[groupId]) {
                        this.masterAnimation[groupId] = {
                            rotation: 0,
                            position: [0, 0],
                            scale: [1, 1]
                        };
                    }
                }
            }
        }
    }

    updateMasterAnimation(animation, elapsed) {
        // For each group in the animation
        for (const [groupId, transformations] of Object.entries(animation.group || {})) {
            // Ensure group exists in master animation
            if (!this.masterAnimation[groupId]) {
                this.masterAnimation[groupId] = {
                    rotation: 0,
                    position: [0, 0],
                    scale: [1, 1] // Base scale is 1,1
                };
            }

            // Calculate this animation's contribution
            const { rotation, position, scale } = this.evaluateTransformations(transformations, elapsed);

            // Add the transformations to existing values
            this.masterAnimation[groupId].rotation += rotation;
            this.masterAnimation[groupId].position[0] += position[0];
            this.masterAnimation[groupId].position[1] += position[1];
            
            // For scale, we add the scale factors instead of multiplying
            this.masterAnimation[groupId].scale[0] += scale[0];
            this.masterAnimation[groupId].scale[1] += scale[1];
        }
    }

    applyMasterAnimation() {
        // Apply the combined transformations to each group
        for (const [groupId, transforms] of Object.entries(this.masterAnimation)) {
            const groupElement = this.container.querySelector(`#${groupId}`);
    
            if (groupElement) {
                // Create transformation string combining all effects
                const transformString = `
                    translate(${transforms.position[0]}, ${transforms.position[1]})
                    rotate(${transforms.rotation})
                    scale(${Math.max(0, transforms.scale[0])}, ${Math.max(0, transforms.scale[1])})
                `.trim();
    
                groupElement.setAttribute("transform", transformString);
            }
        }
    }

    evaluateTransformations(transformations, time) {
        let rotation = 0;
        let position = [0, 0];
        let scale = [0, 0];

        // Check if this is a keyframe animation
        if ('0' in transformations) {
            // Get all keyframe timestamps and their corresponding values
            const keyframes = Object.keys(transformations)
                .map(Number)
                .sort((a, b) => a - b);

            // Find the current keyframe based on normalized time
            const normalizedTime = time % (this.activeAnimations.event?.animation_length || 2);
            
            // Find the surrounding keyframes
            let keyframeIndex = 0;
            while (keyframeIndex < keyframes.length - 1 && keyframes[keyframeIndex + 1] <= normalizedTime) {
                keyframeIndex++;
            }

            // Get four points for Catmull-Rom interpolation
            const p0Index = Math.max(0, keyframeIndex - 1);
            const p1Index = keyframeIndex;
            const p2Index = Math.min(keyframes.length - 1, keyframeIndex + 1);
            const p3Index = Math.min(keyframes.length - 1, keyframeIndex + 2);

            // Calculate local interpolation factor
            const t = (normalizedTime - keyframes[p1Index]) / 
                     (keyframes[p2Index] - keyframes[p1Index]);

            // Get the lerp mode from the animation data
            const lerpMode = this.activeAnimations.event?.lerp_mode || 'linear';
            const interpolate = LerpModes[lerpMode] || LerpModes.linear;

            // Interpolate each property
            if ('scale' in transformations[keyframes[p1Index]]) {
                const p0 = transformations[keyframes[p0Index]]?.scale;
                const p1 = transformations[keyframes[p1Index]].scale;
                const p2 = transformations[keyframes[p2Index]].scale;
                const p3 = transformations[keyframes[p3Index]]?.scale;
                scale = interpolate(p0, p1, p2, p3, t);
            }

            if ('rotation' in transformations[keyframes[p1Index]]) {
                const p0 = transformations[keyframes[p0Index]]?.rotation;
                const p1 = transformations[keyframes[p1Index]].rotation;
                const p2 = transformations[keyframes[p2Index]].rotation;
                const p3 = transformations[keyframes[p3Index]]?.rotation;
                rotation = interpolate(p0, p1, p2, p3, t);
            }

            if ('post' in transformations[keyframes[p1Index]]) {
                const p0 = transformations[keyframes[p0Index]]?.post;
                const p1 = transformations[keyframes[p1Index]].post;
                const p2 = transformations[keyframes[p2Index]].post;
                const p3 = transformations[keyframes[p3Index]]?.post;
                position = interpolate(p0, p1, p2, p3, t);
            }
        } else {
            // Handle continuous animations as before
            for (const [property, value] of Object.entries(transformations)) {
                const finalValue = this.evaluateArray(value, time);
                switch (property) {
                    case "rotation": rotation = finalValue; break;
                    case "post": position = finalValue; break;
                    case "scale": scale = finalValue; break;
                }
            }
        }

        return { rotation, position, scale };
    }

    evaluateArray(val, time) {
        if (!Array.isArray(val)) {
            return typeof val === 'string' ? this.safeEval(val, time) : val;
        }
        return val.map(v => (typeof v === 'string' ? this.safeEval(v, time) : v));
    }

    safeEval(expression, time) {
        try {
            return new Function("time", `return ${expression};`)(time);
        } catch (e) {
            console.error("Error evaluating expression:", expression, e);
            return 0;
        }
    }
}

// Base class for game entities
class Entity {
    constructor(svgPath, scale = 0.8) {
        this.position = { row: 1, col: 1 }; // Default position
        this.container = document.createElement('div');
        this.container.style.transform = `scale(${scale})`;
        this.svgPath = svgPath;
    }

    // Set position in the grid
    setPosition(row, col, slot) {
        this.position = { row, col };
        slot.appendChild(this.container);
    }

    update(timestamp, deltaTime) {}

    render() {}
}

// Specific plant class for Sunflower
class Sunflower extends Entity {
    constructor(scale = 0.8, offset = -1) {
        super('./assets/plants/sunflower/sunflower.svg', scale);
        this.lastProduceTime = 0;
        this.animationController = null;

        // Add debug logging
        loadAnimationData('./assets/plants/sunflower/animation.json')
            .then(animationData => {
                this.animationController = new AnimationController(
                    this.container, 
                    this.svgPath, 
                    animationData
                );
            })
            .catch(error => console.error("Failed to load sunflower animation data:", error));
    }

    update(timestamp, deltaTime) {
        if (this.animationController) {
            // Use the time relative to when the sunflower was added
            const relativeTime = timestamp - this.animationController.addTime;
            if (!this.animationController.activeAnimations.event) {
                if (relativeTime % 5000 < deltaTime) {
                    this.animationController.play('produce', timestamp);
                }
            }
        }
    }
}
class CollectableSun extends Entity {
    constructor(scale = 1.3) {
        super('./assets/other/sun/sun.svg', scale);
        this.position = { x: 0, y: 0 }; // Position in pixels
        this.container.style.position = 'absolute';

        loadAnimationData('./assets/other/sun/animation.json')
            .then(animationData => {
                this.animationController = new AnimationController(
                    this.container, 
                    this.svgPath, 
                    animationData
                );
            })
            .catch(error => console.error("Failed to load sun animation data:", error));
    }

    setPosition(x, y) {
        this.position = { x, y };
        this.container.style.left = `${x}px`;
        this.container.style.top = `${y}px`;
    }

    update(timestamp, deltaTime) {
        if (this.animationController) {
            this.animationController.play('loop');
        }
    }
    clicked() {
        // Additional logic when sun is clicked

    }

    render() {
        // Additional rendering logic if needed
    }
}
// Game engine code
class GameEngine {
    constructor(rows, columns, gridContainer, freePostContainer) {
        this.lastTimestamp = 0;
        this.isRunning = true;
        this.rows = rows;
        this.columns = columns;
        this.entities = [];
        this.grid = Array.from({ length: rows }, () => Array(columns).fill(null));
        this.gameContainer = gridContainer;
        this.freePostContainer = freePostContainer;
        this.initializeGrid();
    }

    initializeGrid() {
        for (let row = 1; row <= this.rows; row++) {
            for (let col = 1; col <= this.columns; col++) {
                const cellId = `cell-${row}-${col}`;
                const cell = document.getElementById(cellId);
                if (cell) {
                    this.grid[row - 1][col - 1] = cell;
                } else {
                    console.error(`Cell with ID ${cellId} not found.`);
                }
            }
        }
    }

    addPlant(plant, row, col) {
        let existingPlant = this.entities.find(entity => entity.position.row === row && entity.position.col === col);
        if (existingPlant) {
            console.error("Plant already exists at this position");
            return false;
        }
        if (row > this.rows || col > this.columns || this.grid[row - 1][col - 1] === null) {
            console.error("Invalid position for plant");
            return false;
        }
        plant.setPosition(row, col, this.grid[row - 1][col - 1]);
        this.entities.push(plant);
    }
    spawnSun(x, y) {
        const sun = new CollectableSun();
        this.freePostContainer.appendChild(sun.container);
        this.entities.push(sun);
    }
    start() {
        this.isRunning = true;
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    gameLoop(timestamp) {
        const deltaTime = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;

        this.entities.forEach(entity => {
            entity.update(timestamp, deltaTime);
            entity.render();
        });

        if (this.isRunning) {
            requestAnimationFrame(this.gameLoop.bind(this));
        }
    }

    stop() {
        this.isRunning = false;
    }
}

const engine = new GameEngine(5, 6, document.getElementById('game-container'), document.getElementById('freepost-container'));

const sunflower1 = new Sunflower();

const sun1 = new CollectableSun();

engine.addPlant(sunflower1, 1, 1);
engine.spawnSun(100, 100);

engine.start();

setTimeout(() => {
    const sunflower2 = new Sunflower();
    engine.addPlant(sunflower2, 2, 2);
}, 3000);