import { gameState } from "./gameState.js";

// 定义SVG命名空间
const svgNS = "http://www.w3.org/2000/svg";

// 记录元素状态的辅助函数
function logElementState(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    console.log(`Element ${elementId}:`, {
      display: window.getComputedStyle(element).display,
      visibility: window.getComputedStyle(element).visibility,
      zIndex: window.getComputedStyle(element).zIndex,
      position: window.getComputedStyle(element).position,
    });
  } else {
    console.log(`Element ${elementId} not found`);
  }
}

// 创建SVG元素的辅助函数
function createSVGElement(type, attributes) {
  const element = document.createElementNS(svgNS, type);
  for (const key in attributes) {
    element.setAttribute(key, attributes[key]);
  }
  return element;
}
// 计算六边形顶点的函数
function calculateHexagonPoints(centerX, centerY, radius) {
  let points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    points.push(`${x},${y}`);
  }
  return points.join(" ");
}

function lerp(start, end, factor) {
  return start + (end - start) * factor;
}

function lerpAngle(start, end, factor) {
  const diff = end - start;
  const shortestAngle = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
  return start + shortestAngle * factor;
}

function addExplosion(x, y) {
  gameState.explosions.push({
    x: x,
    y: y,
    frame: 0,
    startTime: performance.now(),
  });
}

export {
  logElementState,
  createSVGElement,
  calculateHexagonPoints,
  lerp,
  lerpAngle,
  addExplosion,
  svgNS,
};
