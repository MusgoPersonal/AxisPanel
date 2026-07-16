export function persisted(key, initial) {
  const existing = localStorage.getItem(key);
  const isPrimitive = val => val !== Object(val) || val === null;
  const primitive = isPrimitive(initial);
  const parsed = existing ? JSON.parse(existing) : initial;
  
  let state = primitive ? { value: parsed } : parsed;
  
  const handlers = new Set();
  
  function notify() {
    handlers.forEach(h => h(state));
  }
  
  function subscribe(fn) {
    handlers.add(fn);
    return () => handlers.delete(fn);
  }
  
  function setValue(newVal) {
    state = primitive ? { value: newVal } : newVal;
    localStorage.setItem(key, JSON.stringify(primitive ? state.value : state));
    notify();
  }
  
  function getValue() {
    return primitive ? state.value : state;
  }
  
  return {
    get value() { return getValue(); },
    set value(v) { setValue(v); },
    subscribe,
    getState: getValue
  };
}

export function createSpring(initial, { stiffness = 0.15, damping = 0.4 } = {}) {
  let current = initial;
  let target = initial;
  let velocity = 0;
  let rafId = null;
  const subscribers = new Set();
  
  function step() {
    const displacement = target - current;
    const springForce = displacement * stiffness;
    const dampingForce = velocity * damping;
    const acceleration = springForce - dampingForce;
    velocity += acceleration;
    current += velocity;
    
    if (Math.abs(velocity) < 0.01 && Math.abs(displacement) < 0.01) {
      current = target;
      velocity = 0;
      subscribers.forEach(s => s(current));
      return;
    }
    
    subscribers.forEach(s => s(current));
    rafId = requestAnimationFrame(step);
  }
  
  return {
    get value() { return current; },
    set value(v) { 
      target = v; 
      if (!rafId) rafId = requestAnimationFrame(step); 
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    }
  };
}

export function interpolate(input, output) {
  return (value) => {
    if (value <= input[0]) return output[0];
    if (value >= input[input.length - 1]) return output[output.length - 1];
    
    for (let i = 0; i < input.length - 1; i++) {
      if (value >= input[i] && value <= input[i + 1]) {
        const t = (value - input[i]) / (input[i + 1] - input[i]);
        return output[i] + t * (output[i + 1] - output[i]);
      }
    }
    return output[output.length - 1];
  };
}

export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}