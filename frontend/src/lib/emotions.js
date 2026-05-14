export function distance(p1, p2) {
  return Math.sqrt(
    Math.pow(p1.x - p2.x, 2) +
    Math.pow(p1.y - p2.y, 2)
  );
}

export function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

export function getGazeDirection(landmarks) {
  if (!landmarks || landmarks.length < 478) return {
    horizontal: 'center', vertical: 'center',
    lookingAtCamera: true, gazeX: 0.5, gazeY: 0.5
  };

  const leftIris = landmarks[468];
  const leftEyeInner = landmarks[133];
  const leftEyeOuter = landmarks[33];
  const leftEyeTop = landmarks[159];
  const leftEyeBottom = landmarks[145];

  const eyeWidth = distance(leftEyeInner, leftEyeOuter);
  const eyeHeight = distance(leftEyeTop, leftEyeBottom);

  if (eyeWidth === 0) return { horizontal: 'center', vertical: 'center', lookingAtCamera: true, gazeX: 0.5, gazeY: 0.5 };

  const gazeX = (leftIris.x - leftEyeOuter.x) / eyeWidth;
  const gazeY = (leftIris.y - leftEyeTop.y) / eyeHeight;

  let horizontal = 'center';
  if (gazeX < 0.35) horizontal = 'right';
  else if (gazeX > 0.65) horizontal = 'left';

  let vertical = 'center';
  if (gazeY < 0.25) vertical = 'up';
  else if (gazeY > 0.75) vertical = 'down';

  return {
    horizontal, vertical, gazeX, gazeY,
    lookingAtCamera: horizontal === 'center' && vertical === 'center',
  };
}

export function getHeadPose(landmarks) {
  if (!landmarks || landmarks.length < 454) return {
    yaw: 0.5, pitch: 0.45, rollDegrees: 0,
    facingCamera: true, lookingDown: false, turnedAway: false, headTilted: false
  };

  const noseTip = landmarks[1];
  const chin = landmarks[152];
  const forehead = landmarks[10];
  const leftEar = landmarks[234];
  const rightEar = landmarks[454];

  const earWidth = rightEar.x - leftEar.x;
  const yaw = earWidth > 0 ? (noseTip.x - leftEar.x) / earWidth : 0.5;

  const faceHeight = chin.y - forehead.y;
  const pitch = faceHeight > 0 ? (noseTip.y - forehead.y) / faceHeight : 0.45;

  const rollRad = Math.atan2(rightEar.y - leftEar.y, rightEar.x - leftEar.x);
  const rollDegrees = rollRad * (180 / Math.PI);

  return {
    yaw, pitch, rollDegrees,
    facingCamera: yaw > 0.35 && yaw < 0.65,
    lookingDown: pitch > 0.55,
    lookingUp: pitch < 0.35,
    turnedAway: yaw < 0.3 || yaw > 0.7,
    headTilted: Math.abs(rollDegrees) > 15,
  };
}

export function getEAR(landmarks) {
  if (!landmarks || landmarks.length < 386) return {
    average: 0.3, blinking: false, drowsy: false
  };

  const leftTop = landmarks[159];
  const leftBottom = landmarks[145];
  const leftInner = landmarks[133];
  const leftOuter = landmarks[33];

  const leftV = distance(leftTop, leftBottom);
  const leftH = distance(leftInner, leftOuter);
  const leftEAR = leftH > 0 ? leftV / leftH : 0.3;

  const rightTop = landmarks[386];
  const rightBottom = landmarks[380];
  const rightInner = landmarks[362];
  const rightOuter = landmarks[263];

  const rightV = distance(rightTop, rightBottom);
  const rightH = distance(rightInner, rightOuter);
  const rightEAR = rightH > 0 ? rightV / rightH : 0.3;

  const avg = (leftEAR + rightEAR) / 2;

  return {
    left: leftEAR, right: rightEAR, average: avg,
    blinking: avg < 0.15,
    drowsy: avg < 0.22,
    wideOpen: avg > 0.35,
  };
}

export function getMouthMetrics(landmarks) {
  if (!landmarks || landmarks.length < 291) return {
    smiling: false, isOpen: false, smileIntensity: 0
  };

  const leftCorner = landmarks[61];
  const rightCorner = landmarks[291];
  const topLip = landmarks[13];
  const bottomLip = landmarks[14];

  const mouthWidth = distance(leftCorner, rightCorner);
  const mouthHeight = distance(topLip, bottomLip);
  const MAR = mouthWidth > 0 ? mouthHeight / mouthWidth : 0;

  const cornerAvgY = (leftCorner.y + rightCorner.y) / 2;
  const smiling = cornerAvgY < topLip.y;

  return {
    width: mouthWidth, height: mouthHeight, MAR,
    isOpen: MAR > 0.2,
    isTalking: MAR > 0.1 && MAR < 0.5,
    smiling,
    smileIntensity: smiling ? Math.abs(topLip.y - cornerAvgY) / mouthWidth : 0,
  };
}

export function analyzeEmotions(landmarks, history = []) {
  const gaze = getGazeDirection(landmarks);
  const ear = getEAR(landmarks);
  const mouth = getMouthMetrics(landmarks);
  const headPose = getHeadPose(landmarks);

  const recentHistory = history.slice(-30);
  const blinkCount = recentHistory.filter(h => h.ear?.blinking).length;
  const blinkRate = blinkCount * 2; // per minute estimate

  const gazeXValues = recentHistory.map(h => h.gaze?.gazeX || 0.5);
  const gazeVariance = gazeXValues.length > 1
    ? gazeXValues.reduce((s, v) => s + Math.pow(v - 0.5, 2), 0) / gazeXValues.length
    : 0;
  const gazeStability = clamp(1 - gazeVariance * 10, 0, 1);

  const nodding = detectNodding(recentHistory);

  const emotions = {
    happy: clamp(
      (mouth.smiling ? 0.6 : 0) + mouth.smileIntensity * 0.4,
      0, 1
    ),
    focused: clamp(
      (gaze.lookingAtCamera ? 0.35 : 0) +
      (gazeStability > 0.7 ? 0.35 : 0) +
      (!ear.blinking ? 0.1 : 0) +
      (!headPose.turnedAway ? 0.2 : 0),
      0, 1
    ),
    engaged: clamp(
      (gaze.lookingAtCamera ? 0.35 : 0) +
      (nodding ? 0.25 : 0) +
      (mouth.smiling ? 0.2 : 0) +
      (gazeStability > 0.6 ? 0.2 : 0),
      0, 1
    ),
    confused: clamp(
      (headPose.headTilted ? 0.35 : 0) +
      (ear.wideOpen ? 0.25 : 0) +
      (!mouth.smiling ? 0.2 : 0) +
      (!gaze.lookingAtCamera ? 0.2 : 0),
      0, 1
    ),
    nervous: clamp(
      (blinkRate > 25 ? 0.4 : 0) +
      (gazeStability < 0.4 ? 0.3 : 0) +
      (!gaze.lookingAtCamera ? 0.3 : 0),
      0, 1
    ),
    disengaged: clamp(
      (!gaze.lookingAtCamera ? 0.35 : 0) +
      (gazeStability < 0.3 ? 0.3 : 0) +
      (ear.drowsy ? 0.2 : 0) +
      (headPose.lookingDown ? 0.15 : 0),
      0, 1
    ),
    suspicious: clamp(
      (headPose.turnedAway ? 0.3 : 0) +
      (headPose.lookingDown ? 0.25 : 0) +
      (gazeStability < 0.2 ? 0.2 : 0) +
      (detectRepeatedPattern(recentHistory) ? 0.25 : 0),
      0, 1
    ),
  };

  const sorted = Object.entries(emotions).sort((a, b) => b[1] - a[1]);
  emotions.dominant = sorted[0][0];
  emotions.dominantScore = sorted[0][1];

  return emotions;
}

function detectNodding(history) {
  if (history.length < 8) return false;
  const pitches = history.map(h => h.headPose?.pitch || 0.45);
  let changes = 0;
  for (let i = 2; i < pitches.length; i++) {
    const prev = pitches[i - 1] - pitches[i - 2];
    const curr = pitches[i] - pitches[i - 1];
    if ((prev > 0.01 && curr < -0.01) || (prev < -0.01 && curr > 0.01)) changes++;
  }
  return changes >= 3;
}

function detectRepeatedPattern(history) {
  if (history.length < 8) return false;
  const offScreen = history.filter(h => !h.gaze?.lookingAtCamera);
  if (offScreen.length < 5) return false;
  const rights = offScreen.filter(h => (h.gaze?.gazeX || 0.5) > 0.5).length;
  return (rights / offScreen.length > 0.7) || (rights / offScreen.length < 0.3);
}

export function calculateScores(stats) {
  const attention = clamp(
    100 - (stats.lookAwayCount * 0.5) - (stats.faceAbsentCount * 0.3),
    0, 100
  );
  const integrity = clamp(
    100 - (stats.tabSwitchCount * 12) - (stats.multiFaceCount * 8) - (stats.audioAnomalyCount * 6),
    0, 100
  );
  const engagement = clamp(
    100 - (stats.faceAbsentCount * 0.5) + (stats.nodCount * 0.2),
    0, 100
  );
  const overall = (attention * 0.35) + (integrity * 0.4) + (engagement * 0.25);

  return {
    attention: Math.round(attention),
    integrity: Math.round(integrity),
    engagement: Math.round(engagement),
    overall: Math.round(overall),
  };
}