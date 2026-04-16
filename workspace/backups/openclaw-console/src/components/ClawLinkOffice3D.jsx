import React from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, RoundedBox, Text, useCursor } from "@react-three/drei";
import { CanvasTexture, MathUtils, RepeatWrapping, Vector3 } from "three";

const CAMERA_PRESETS = {
  overview: {
    position: [-16.4, 9.6, 20.8],
    target: [0, 1.65, 1.6],
    fov: 31,
  },
  gateway: {
    position: [-13.2, 7.2, 8.8],
    target: [0, 1.45, -8.6],
    fov: 33,
  },
  operations: {
    position: [13.8, 7.2, 9.6],
    target: [7.1, 1.55, 4.9],
    fov: 33,
  },
  agents: {
    position: [0.4, 10.4, 22.2],
    target: [0, 1.55, 9.4],
    fov: 31,
  },
};

const ORBIT_AZIMUTH_HALF_SPAN = Math.PI / 3.8;
const ORBIT_MIN_POLAR = Math.PI / 5.9;
const ORBIT_MAX_POLAR = Math.PI / 2.34;
const ORBIT_MIN_DISTANCE = 9.2;
const ORBIT_MAX_DISTANCE = 32;
const CAMERA_TRANSITION_SPEED = 5.2;
const DESK_SCALE_BOOST = 1.08;
const AVATAR_SCALE = 1.22;
const CHAIR_SCALE = 1.12;
const OFFICE_HALF_WIDTH = 18.4;
const OFFICE_BACK_Z = -13.8;
const OFFICE_FRONT_Z = 17;
const OFFICE_WIDTH = OFFICE_HALF_WIDTH * 2;
const OFFICE_DEPTH = OFFICE_FRONT_Z - OFFICE_BACK_Z;
const SIDE_GLASS_X = OFFICE_HALF_WIDTH - 0.6;
const BACK_GLASS_Z = OFFICE_BACK_Z + 1.4;

const SYSTEM_DESK_SLOTS = [
  { id: "gateway", desk: [0, 0, -9.1], rotation: 0 },
  { id: "chat", desk: [-7.1, 0, -4.8], rotation: Math.PI / 2 },
  { id: "sessions", desk: [7.1, 0, -4.8], rotation: -Math.PI / 2 },
  { id: "logs", desk: [-7.1, 0, 4.8], rotation: Math.PI / 2 },
  { id: "agents", desk: [7.1, 0, 4.8], rotation: -Math.PI / 2 },
  { id: "history", desk: [0, 0, 9.5], rotation: Math.PI },
];

const RUNTIME_ANCHORS = [
  ...[-11.6, -5.8, 5.8, 11.6].map((x) => ({ desk: [x, 0, -10.7], rotation: 0 })),
  ...[-4.4, 1.6, 7.6].map((z) => ({ desk: [-13.8, 0, z], rotation: Math.PI / 2 })),
  ...[-4.4, 1.6, 7.6].map((z) => ({ desk: [13.8, 0, z], rotation: -Math.PI / 2 })),
  ...[-11.6, -5.8, 5.8, 11.6].map((x) => ({ desk: [x, 0, 12.6], rotation: Math.PI })),
];

function buildRuntimeDeskSlots(agents) {
  return agents.map((agent, index) => {
    const anchor = RUNTIME_ANCHORS[index];

    if (anchor) {
      return {
        id: agent.id,
        desk: anchor.desk,
        rotation: anchor.rotation,
        scale: 0.84,
        lane: "runtime",
      };
    }

    const extraIndex = index - RUNTIME_ANCHORS.length;
    const column = extraIndex % 4;
    const row = Math.floor(extraIndex / 4);
    const x = -10.5 + column * 7;
    const z = 15.4 + row * 3.2;

    return {
      id: agent.id,
      desk: [x, 0, z],
      rotation: Math.PI,
      scale: 0.8,
      lane: "runtime",
    };
  });
}

function shorten(value, maxLength = 36) {
  if (typeof value !== "string") return "";
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function getOrbitLimits(preset) {
  const azimuthCenter = Math.atan2(preset.position[0] - preset.target[0], preset.position[2] - preset.target[2]);

  return {
    minAzimuthAngle: azimuthCenter - ORBIT_AZIMUTH_HALF_SPAN,
    maxAzimuthAngle: azimuthCenter + ORBIT_AZIMUTH_HALF_SPAN,
  };
}

function transformLocalPoint(origin, rotation, point) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const x = point[0] * cos + point[2] * sin;
  const z = -point[0] * sin + point[2] * cos;

  return [origin[0] + x, origin[1] + point[1], origin[2] + z];
}

function buildAgentCameraPreset(slot) {
  return {
    position: transformLocalPoint(slot.desk, slot.rotation, [1.88, 2.76, 3.08]),
    target: transformLocalPoint(slot.desk, slot.rotation, [0, 1.02, 0.52]),
    fov: 29,
  };
}

function isVectorCloseToArray(vector, values, epsilon = 0.000001) {
  return Math.abs(vector.x - values[0]) < epsilon && Math.abs(vector.y - values[1]) < epsilon && Math.abs(vector.z - values[2]) < epsilon;
}

function getAgentPose() {
  return {
    headLean: -0.06,
    bodyLean: 0.1,
    armReach: 0.32,
    forearmLift: -0.02,
    legAngle: Math.PI / 2.66,
  };
}

function buildMicrocementTexture(theme) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, 512, 512);
  if (theme === "light") {
    gradient.addColorStop(0, "#ECE8E1");
    gradient.addColorStop(1, "#DDD8D0");
  } else {
    gradient.addColorStop(0, "#23252B");
    gradient.addColorStop(1, "#17191E");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  for (let index = 0; index < 1800; index += 1) {
    const shade = theme === "light" ? 218 + (index % 6) * 3 : 46 + (index % 6) * 4;
    ctx.fillStyle =
      theme === "light"
        ? `rgba(${shade}, ${shade - 2}, ${shade - 5}, 0.06)`
        : `rgba(${shade}, ${shade + 1}, ${shade + 4}, 0.08)`;
    ctx.fillRect((index * 37) % 512, (index * 53) % 512, 2, 2);
  }

  for (let y = 48; y < 512; y += 112) {
    ctx.strokeStyle = theme === "light" ? "rgba(205, 198, 188, 0.28)" : "rgba(255,255,255,0.05)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y + 12);
    ctx.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(8, 8);
  return texture;
}

function buildWoodTexture(theme) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = theme === "light" ? "#D8BE97" : "#745337";
  ctx.fillRect(0, 0, 512, 512);

  const plankWidth = 48;
  for (let x = 0; x < 512; x += plankWidth) {
    const tone = theme === "light" ? 204 + ((x / plankWidth) % 4) * 8 : 92 + ((x / plankWidth) % 4) * 6;
    const green = theme === "light" ? tone - 22 : tone - 16;
    const blue = theme === "light" ? tone - 48 : tone - 28;
    ctx.fillStyle = `rgb(${tone}, ${green}, ${blue})`;
    ctx.fillRect(x, 0, plankWidth - 2, 512);

    ctx.strokeStyle = theme === "light" ? "rgba(109, 84, 54, 0.18)" : "rgba(0,0,0,0.26)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + plankWidth - 2, 0);
    ctx.lineTo(x + plankWidth - 2, 512);
    ctx.stroke();

    for (let y = 0; y < 512; y += 22) {
      ctx.fillStyle =
        theme === "light"
          ? `rgba(154, 114, 66, ${0.04 + ((x + y) % 3) * 0.02})`
          : `rgba(34, 22, 14, ${0.05 + ((x + y) % 3) * 0.02})`;
      ctx.fillRect(x + 4, y + ((x / plankWidth) % 2 === 0 ? 3 : 8), plankWidth - 10, 1.5);
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(4.6, 4.6);
  return texture;
}

function OfficeFloor({ theme }) {
  const concreteTexture = React.useMemo(() => buildMicrocementTexture(theme), [theme]);
  const woodTexture = React.useMemo(() => buildWoodTexture(theme), [theme]);
  const accentColor = theme === "light" ? "#e8ddcd" : "#20242d";

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.035, 0]} receiveShadow>
        <planeGeometry args={[OFFICE_WIDTH + 16, OFFICE_DEPTH + 18]} />
        <meshStandardMaterial color={theme === "light" ? "#eef1f1" : "#0b1018"} roughness={1} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[OFFICE_WIDTH + 4.2, OFFICE_DEPTH + 4.2]} />
        <meshStandardMaterial map={concreteTexture} color={theme === "light" ? "#f3eee8" : "#23262d"} roughness={0.94} metalness={0.03} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -0.8]} receiveShadow>
        <planeGeometry args={[18.2, 12.6]} />
        <meshStandardMaterial map={woodTexture} color={theme === "light" ? "#f3ebe0" : "#6b4b35"} roughness={0.76} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, -10.1]} receiveShadow>
        <planeGeometry args={[25.2, 4.6]} />
        <meshStandardMaterial map={woodTexture} color={theme === "light" ? "#f2e8da" : "#5f4332"} roughness={0.74} />
      </mesh>

      {[-12.9, 12.9].map((x) => (
        <mesh key={`wing-zone-${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.012, 1.8]} receiveShadow>
          <planeGeometry args={[7.2, 13.6]} />
          <meshStandardMaterial color={theme === "light" ? "#efe5d8" : "#1f232b"} roughness={0.92} />
        </mesh>
      ))}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 12.5]} receiveShadow>
        <planeGeometry args={[28.2, 4.8]} />
        <meshStandardMaterial color={theme === "light" ? "#ece4d7" : "#242933"} roughness={0.9} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 8.8]} receiveShadow>
        <planeGeometry args={[5.2, 11.8]} />
        <meshPhysicalMaterial
          color={theme === "light" ? "#f1ebe1" : "#1b2028"}
          roughness={0.38}
          metalness={0.14}
          clearcoat={0.26}
          clearcoatRoughness={0.32}
        />
      </mesh>

      {[-2.78, 2.78].map((x) => (
        <mesh key={`brass-line-${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, 5.9]} receiveShadow>
          <planeGeometry args={[0.12, 17.4]} />
          <meshStandardMaterial
            color={theme === "light" ? "#c8a97e" : "#8b6849"}
            emissive={theme === "light" ? "#f7e8d1" : "#8b6849"}
            emissiveIntensity={theme === "light" ? 0.03 : 0.08}
            roughness={0.44}
            metalness={0.42}
          />
        </mesh>
      ))}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 1.6]} receiveShadow>
        <ringGeometry args={[3.6, 4.35, 48]} />
        <meshStandardMaterial color={accentColor} roughness={0.88} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.019, 1.6]} receiveShadow>
        <ringGeometry args={[3.92, 3.98, 48]} />
        <meshStandardMaterial color={theme === "light" ? "#cfb79a" : "#7d5940"} emissive={theme === "light" ? "#fff7ed" : "#7d5940"} emissiveIntensity={theme === "light" ? 0.05 : 0.12} />
      </mesh>
    </group>
  );
}

function FrameBar({ position, args, color }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={0.7} metalness={0.08} />
    </mesh>
  );
}

function InteriorPlanter({ position, theme, size = "medium" }) {
  const scale = size === "small" ? 0.82 : 1;

  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.95, 0.6, 0.95]} />
        <meshStandardMaterial color={theme === "light" ? "#d7c9b6" : "#43342b"} roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.09, 0.72, 10]} />
        <meshStandardMaterial color={theme === "light" ? "#8c6b4d" : "#5c4738"} roughness={0.82} />
      </mesh>
      {[
        [-0.16, 1.18, 0.02],
        [0.15, 1.14, -0.06],
        [0.02, 1.34, 0.14],
        [-0.04, 1.45, -0.12],
        [0.18, 1.52, 0.06],
        [-0.2, 1.55, -0.02],
      ].map(([x, y, z], index) => (
        <mesh
          key={`leaf-${index}`}
          position={[x, y, z]}
          rotation={[0, 0, index % 2 === 0 ? 0.45 : -0.45]}
          castShadow
        >
          <boxGeometry args={[0.34, 0.05, 0.16]} />
          <meshStandardMaterial color={index % 3 === 0 ? "#74a970" : index % 3 === 1 ? "#4f8a58" : "#89bc82"} roughness={0.84} />
        </mesh>
      ))}
    </group>
  );
}

function ExteriorTree({ position, theme, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 1.3, 0]}>
        <cylinderGeometry args={[0.08, 0.12, 2.6, 8]} />
        <meshStandardMaterial color={theme === "light" ? "#866449" : "#5a4636"} roughness={0.92} />
      </mesh>
      <mesh position={[0, 3.1, 0]}>
        <coneGeometry args={[1.1, 2.6, 8]} />
        <meshStandardMaterial color={theme === "light" ? "#6fa06a" : "#385942"} roughness={0.95} />
      </mesh>
      <mesh position={[0.24, 3.48, 0.1]}>
        <sphereGeometry args={[0.48, 8, 8]} />
        <meshStandardMaterial color={theme === "light" ? "#7aad74" : "#45674e"} roughness={0.95} />
      </mesh>
    </group>
  );
}

function OfficeShell({ theme }) {
  const frameColor = theme === "light" ? "#d1c3b0" : "#313743";
  const frameDark = theme === "light" ? "#bfae9a" : "#242a34";
  const glassColor = theme === "light" ? "#edf5f6" : "#8bc6d8";
  const glassEmissive = theme === "light" ? "#ffffff" : "#0d1b2a";
  const glassOpacity = theme === "light" ? 0.25 : 0.12;
  const signColor = theme === "light" ? "#171717" : "#f8fafc";

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, BACK_GLASS_Z - 6.8]} receiveShadow>
        <planeGeometry args={[OFFICE_WIDTH + 10, 10]} />
        <meshStandardMaterial color={theme === "light" ? "#dce8d8" : "#14202b"} roughness={1} />
      </mesh>

      <group position={[0, 3.12, BACK_GLASS_Z]}>
        <mesh>
          <boxGeometry args={[OFFICE_WIDTH - 3.2, 6.2, 0.08]} />
          <meshPhysicalMaterial
            color={glassColor}
            transparent
            opacity={glassOpacity}
            roughness={0.1}
            metalness={0.08}
            emissive={glassEmissive}
            emissiveIntensity={theme === "light" ? 0.03 : 0.06}
            clearcoat={0.4}
            clearcoatRoughness={0.14}
          />
        </mesh>
        <FrameBar position={[0, 3.16, 0]} args={[OFFICE_WIDTH - 2.8, 0.18, 0.18]} color={frameColor} />
        <FrameBar position={[0, -3.16, 0]} args={[OFFICE_WIDTH - 2.8, 0.18, 0.18]} color={frameDark} />
        {[-10.6, 0, 10.6].map((x) => (
          <FrameBar key={`back-frame-${x}`} position={[x, 0, 0]} args={[0.12, 6, 0.12]} color={frameColor} />
        ))}
      </group>

      <group position={[-SIDE_GLASS_X, 3.12, 0.8]}>
        <mesh>
          <boxGeometry args={[0.08, 6.2, OFFICE_DEPTH - 10.8]} />
          <meshPhysicalMaterial
            color={glassColor}
            transparent
            opacity={glassOpacity}
            roughness={0.1}
            metalness={0.08}
            emissive={glassEmissive}
            emissiveIntensity={theme === "light" ? 0.03 : 0.06}
            clearcoat={0.36}
            clearcoatRoughness={0.14}
          />
        </mesh>
        <FrameBar position={[0, 3.16, 0]} args={[0.18, 0.18, OFFICE_DEPTH - 10.4]} color={frameColor} />
        <FrameBar position={[0, -3.16, 0]} args={[0.18, 0.18, OFFICE_DEPTH - 10.4]} color={frameDark} />
        {[-7.2, 0, 7.2].map((z) => (
          <FrameBar key={`left-frame-${z}`} position={[0, 0, z]} args={[0.12, 6, 0.12]} color={frameColor} />
        ))}
      </group>

      <group position={[SIDE_GLASS_X, 3.12, 0.8]}>
        <mesh>
          <boxGeometry args={[0.08, 6.2, OFFICE_DEPTH - 10.8]} />
          <meshPhysicalMaterial
            color={glassColor}
            transparent
            opacity={glassOpacity}
            roughness={0.1}
            metalness={0.08}
            emissive={glassEmissive}
            emissiveIntensity={theme === "light" ? 0.03 : 0.06}
            clearcoat={0.36}
            clearcoatRoughness={0.14}
          />
        </mesh>
        <FrameBar position={[0, 3.16, 0]} args={[0.18, 0.18, OFFICE_DEPTH - 10.4]} color={frameColor} />
        <FrameBar position={[0, -3.16, 0]} args={[0.18, 0.18, OFFICE_DEPTH - 10.4]} color={frameDark} />
        {[-7.2, 0, 7.2].map((z) => (
          <FrameBar key={`right-frame-${z}`} position={[0, 0, z]} args={[0.12, 6, 0.12]} color={frameColor} />
        ))}
      </group>

      {[-8.8, 8.8].map((x) => (
        <React.Fragment key={`entry-${x}`}>
          <FrameBar position={[x, 3.1, OFFICE_FRONT_Z - 0.5]} args={[0.2, 6.1, 0.2]} color={frameColor} />
          <FrameBar position={[x, 0.72, OFFICE_FRONT_Z - 0.5]} args={[0.76, 1.36, 0.18]} color={frameDark} />
        </React.Fragment>
      ))}
      <FrameBar position={[0, 6.2, OFFICE_FRONT_Z - 0.5]} args={[17.8, 0.18, 0.18]} color={frameColor} />

      <RoundedBox args={[8.4, 0.2, 0.18]} radius={0.04} smoothness={4} position={[0, 4.32, BACK_GLASS_Z + 0.1]}>
        <meshStandardMaterial color={theme === "light" ? "#fffaf4" : "#151922"} emissive={theme === "light" ? "#ffffff" : "#15283d"} emissiveIntensity={theme === "light" ? 0.04 : 0.12} />
      </RoundedBox>
      {[-5.4, 5.4].map((x) => (
        <RoundedBox key={`feature-light-${x}`} args={[0.18, 2.8, 0.12]} radius={0.05} smoothness={4} position={[x, 2.56, BACK_GLASS_Z + 0.16]}>
          <meshStandardMaterial
            color={theme === "light" ? "#f6ead8" : "#f2b78a"}
            emissive={theme === "light" ? "#f6ead8" : "#f2b78a"}
            emissiveIntensity={theme === "light" ? 0.14 : 0.36}
          />
        </RoundedBox>
      ))}
      <Text position={[0, 4.62, BACK_GLASS_Z + 0.18]} fontSize={0.34} color={signColor} anchorX="center" anchorY="middle">
        ClawLink
      </Text>
      <Text position={[0, 4.22, BACK_GLASS_Z + 0.18]} fontSize={0.12} color={theme === "light" ? "#6b7280" : "#94a3b8"} anchorX="center" anchorY="middle">
        headquarters · scheduling floor
      </Text>

      <InteriorPlanter position={[-11.8, 0, -7.5]} theme={theme} />
      <InteriorPlanter position={[11.9, 0, -7.5]} theme={theme} size="small" />
      <InteriorPlanter position={[12.5, 0, 7.6]} theme={theme} size="small" />

      {[-12.8, -5.2, 4.6, 12.2].map((x, index) => (
        <ExteriorTree
          key={`ext-tree-${x}`}
          position={[x, 0, BACK_GLASS_Z - 5.2 - (index % 2) * 0.8]}
          theme={theme}
          scale={index % 2 === 0 ? 1.1 : 0.86}
        />
      ))}
    </group>
  );
}

function TerraceReflectingPool({ theme }) {
  return (
    <group position={[0, 0, BACK_GLASS_Z - 1.1]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, -2.2]} receiveShadow>
        <planeGeometry args={[24.6, 4.8]} />
        <meshStandardMaterial
          color={theme === "light" ? "#a8d3df" : "#163449"}
          emissive={theme === "light" ? "#d7eef6" : "#163449"}
          emissiveIntensity={theme === "light" ? 0.04 : 0.14}
          roughness={0.18}
          metalness={0.16}
          transparent
          opacity={0.92}
        />
      </mesh>
      {[-8.6, -2.8, 2.8, 8.6].map((x) => (
        <mesh key={`pool-strip-${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.05, -2.2]} receiveShadow>
          <planeGeometry args={[1.24, 0.12]} />
          <meshStandardMaterial
            color={theme === "light" ? "#f3eadc" : "#ffcf9c"}
            emissive={theme === "light" ? "#f3eadc" : "#ffcf9c"}
            emissiveIntensity={theme === "light" ? 0.04 : 0.18}
          />
        </mesh>
      ))}
      {[-5.2, 0, 5.2].map((x) => (
        <mesh key={`pool-stone-${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.055, -2.2]} receiveShadow>
          <planeGeometry args={[2.1, 0.82]} />
          <meshStandardMaterial color={theme === "light" ? "#d9d8d3" : "#4a525c"} roughness={0.88} />
        </mesh>
      ))}
    </group>
  );
}

function ExecutiveBench({ position, theme, mirror = false }) {
  const upholstery = theme === "light" ? "#d8e0e8" : "#273142";
  const platformColor = theme === "light" ? "#ebe4da" : "#1d2128";
  const woodColor = theme === "light" ? "#c6a27d" : "#674836";

  return (
    <group position={position} rotation={[0, mirror ? Math.PI : 0, 0]}>
      <RoundedBox args={[4.2, 0.08, 2.2]} radius={0.16} smoothness={4} position={[0, 0.04, 0]} receiveShadow>
        <meshStandardMaterial color={platformColor} roughness={0.94} />
      </RoundedBox>
      <RoundedBox args={[2.36, 0.3, 0.9]} radius={0.1} smoothness={4} position={[0.2, 0.34, 0]} castShadow>
        <meshStandardMaterial color={upholstery} roughness={0.72} />
      </RoundedBox>
      <RoundedBox args={[2.36, 0.5, 0.14]} radius={0.06} smoothness={4} position={[0.2, 0.58, -0.36]} castShadow>
        <meshStandardMaterial color={upholstery} roughness={0.74} />
      </RoundedBox>
      <RoundedBox args={[0.8, 0.12, 0.54]} radius={0.08} smoothness={4} position={[-1.22, 0.28, 0.1]} castShadow>
        <meshStandardMaterial color={woodColor} roughness={0.62} />
      </RoundedBox>
      <mesh position={[-1.22, 0.56, 0.1]} castShadow>
        <cylinderGeometry args={[0.12, 0.16, 0.56, 16]} />
        <meshStandardMaterial color={theme === "light" ? "#c7b39b" : "#505968"} roughness={0.8} />
      </mesh>
      <InteriorPlanter position={[-1.84, 0, 0.36]} theme={theme} size="small" />
    </group>
  );
}

function LobbySculpture({ theme }) {
  return (
    <group position={[0, 0, 14.2]}>
      <RoundedBox args={[3.8, 0.22, 1.62]} radius={0.16} smoothness={4} position={[0, 0.11, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={theme === "light" ? "#ebe3d8" : "#1d2128"} roughness={0.9} />
      </RoundedBox>
      <mesh position={[0, 0.84, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.22, 1.1, 20]} />
        <meshStandardMaterial color={theme === "light" ? "#c0aa90" : "#5d6776"} roughness={0.52} metalness={0.42} />
      </mesh>
      <mesh position={[0, 1.6, 0]} rotation={[Math.PI / 2, 0.4, 0]}>
        <torusGeometry args={[0.54, 0.08, 16, 48]} />
        <meshStandardMaterial
          color={theme === "light" ? "#caa57b" : "#d6a36f"}
          emissive={theme === "light" ? "#f4e1c7" : "#d6a36f"}
          emissiveIntensity={theme === "light" ? 0.04 : 0.16}
          roughness={0.28}
          metalness={0.56}
        />
      </mesh>
    </group>
  );
}

function CommandCanopy({ theme }) {
  const lightColor = theme === "light" ? "#f7efe3" : "#ffcc9a";
  const frameColor = theme === "light" ? "#c4ae93" : "#4d5565";

  return (
    <group position={[0, 5.7, 1.6]}>
      {[[-1.8, 0], [1.8, 0], [0, -1.8], [0, 1.8]].map(([x, z]) => (
        <RoundedBox key={`cable-${x}-${z}`} args={[0.03, 1.4, 0.03]} radius={0.01} smoothness={2} position={[x, 0.72, z]}>
          <meshStandardMaterial color={frameColor} roughness={0.88} />
        </RoundedBox>
      ))}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <torusGeometry args={[2.36, 0.05, 18, 56]} />
        <meshStandardMaterial color={frameColor} roughness={0.38} metalness={0.54} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
        <torusGeometry args={[2.12, 0.04, 18, 56]} />
        <meshStandardMaterial color={lightColor} emissive={lightColor} emissiveIntensity={theme === "light" ? 0.12 : 0.46} />
      </mesh>
    </group>
  );
}

function MeetingChair({ theme, position, rotation = 0 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <RoundedBox args={[0.52, 0.12, 0.52]} radius={0.08} smoothness={4} position={[0, 0.32, 0]} castShadow>
        <meshStandardMaterial color={theme === "light" ? "#dbe5ef" : "#273142"} roughness={0.72} />
      </RoundedBox>
      <RoundedBox args={[0.52, 0.42, 0.12]} radius={0.06} smoothness={4} position={[0, 0.54, -0.16]} castShadow>
        <meshStandardMaterial color={theme === "light" ? "#dbe5ef" : "#273142"} roughness={0.72} />
      </RoundedBox>
    </group>
  );
}

function MeetingWing({ position, theme, mirror = false, title = "Strategy Room", accent = "#60a5fa" }) {
  const glassColor = theme === "light" ? "#eff6f8" : "#7dc6dc";
  const glassOpacity = theme === "light" ? 0.22 : 0.1;
  const frameColor = theme === "light" ? "#d3c4b0" : "#2c3340";

  return (
    <group position={position} rotation={[0, mirror ? Math.PI : 0, 0]}>
      <RoundedBox args={[5.8, 0.08, 6.6]} radius={0.18} smoothness={4} position={[0, 0.04, 0]} receiveShadow>
        <meshStandardMaterial color={theme === "light" ? "#efe7dc" : "#1f232b"} roughness={0.95} />
      </RoundedBox>

      <RoundedBox args={[5.5, 2.8, 0.08]} radius={0.06} smoothness={4} position={[0, 1.48, -3.06]}>
        <meshPhysicalMaterial
          color={glassColor}
          transparent
          opacity={glassOpacity}
          roughness={0.08}
          metalness={0.08}
          emissive={theme === "light" ? "#ffffff" : "#0d1b2a"}
          emissiveIntensity={theme === "light" ? 0.02 : 0.08}
        />
      </RoundedBox>
      <RoundedBox args={[0.08, 2.8, 5.8]} radius={0.06} smoothness={4} position={[-2.85, 1.48, -0.2]}>
        <meshPhysicalMaterial
          color={glassColor}
          transparent
          opacity={glassOpacity}
          roughness={0.08}
          metalness={0.08}
          emissive={theme === "light" ? "#ffffff" : "#0d1b2a"}
          emissiveIntensity={theme === "light" ? 0.02 : 0.08}
        />
      </RoundedBox>
      <FrameBar position={[0, 2.92, -3.06]} args={[5.6, 0.16, 0.16]} color={frameColor} />
      <FrameBar position={[0, 0.04, -3.06]} args={[5.6, 0.08, 0.16]} color={frameColor} />
      <FrameBar position={[-2.85, 1.48, -0.2]} args={[0.16, 2.8, 5.9]} color={frameColor} />

      <RoundedBox args={[1.9, 0.12, 1.12]} radius={0.12} smoothness={4} position={[0, 0.84, 0.4]} castShadow>
        <meshStandardMaterial color={theme === "light" ? "#d8ba92" : "#6a4a35"} roughness={0.62} />
      </RoundedBox>
      <mesh position={[0, 0.48, 0.4]} castShadow>
        <cylinderGeometry args={[0.12, 0.22, 0.74, 16]} />
        <meshStandardMaterial color={theme === "light" ? "#ccb79f" : "#4b5563"} roughness={0.78} />
      </mesh>

      <MeetingChair theme={theme} position={[-1.02, 0, -0.38]} />
      <MeetingChair theme={theme} position={[1.02, 0, -0.38]} />
      <MeetingChair theme={theme} position={[-1.02, 0, 1.16]} rotation={Math.PI} />
      <MeetingChair theme={theme} position={[1.02, 0, 1.16]} rotation={Math.PI} />

      <RoundedBox args={[1.7, 0.9, 0.08]} radius={0.08} smoothness={4} position={[0, 1.86, -2.82]}>
        <meshStandardMaterial color={theme === "light" ? "#f8fbff" : "#0f1722"} emissive={accent} emissiveIntensity={theme === "light" ? 0.04 : 0.18} />
      </RoundedBox>
      <Text position={[0, 2.72, -2.76]} fontSize={0.14} color={accent} anchorX="center" anchorY="middle">
        {title}
      </Text>

      <InteriorPlanter position={[1.9, 0, 2.15]} theme={theme} size="small" />
    </group>
  );
}

function TableStool({ theme, position, rotation = 0 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <RoundedBox args={[0.56, 0.1, 0.56]} radius={0.08} smoothness={4} position={[0, 0.4, 0]} castShadow>
        <meshStandardMaterial color={theme === "light" ? "#d8e1ea" : "#2a3445"} roughness={0.72} />
      </RoundedBox>
      <RoundedBox args={[0.08, 0.5, 0.08]} radius={0.02} smoothness={4} position={[0, 0.18, 0]} castShadow>
        <meshStandardMaterial color={theme === "light" ? "#c0b29d" : "#4a5260"} roughness={0.8} />
      </RoundedBox>
    </group>
  );
}

function OfficeChair({ theme, position, rotation = 0, accentColor = "#94a3b8" }) {
  const chairColor = theme === "light" ? "#dbe3ec" : "#263243";
  const frameColor = theme === "light" ? "#b9ab96" : "#4b5563";

  return (
    <group position={position} rotation={[0, rotation, 0]} scale={CHAIR_SCALE}>
      <RoundedBox args={[0.62, 0.08, 0.62]} radius={0.08} smoothness={4} position={[0, 0.44, 0]} castShadow>
        <meshStandardMaterial color={chairColor} roughness={0.72} />
      </RoundedBox>
      <RoundedBox args={[0.56, 0.62, 0.09]} radius={0.06} smoothness={4} position={[0, 0.82, -0.22]} castShadow>
        <meshStandardMaterial color={chairColor} roughness={0.74} />
      </RoundedBox>
      <RoundedBox args={[0.3, 0.16, 0.08]} radius={0.05} smoothness={4} position={[0, 1.2, -0.18]} castShadow>
        <meshStandardMaterial color={chairColor} roughness={0.74} />
      </RoundedBox>
      <RoundedBox args={[0.07, 0.18, 0.4]} radius={0.03} smoothness={4} position={[-0.32, 0.58, -0.02]} castShadow>
        <meshStandardMaterial color={frameColor} roughness={0.76} />
      </RoundedBox>
      <RoundedBox args={[0.07, 0.18, 0.4]} radius={0.03} smoothness={4} position={[0.32, 0.58, -0.02]} castShadow>
        <meshStandardMaterial color={frameColor} roughness={0.76} />
      </RoundedBox>
      <RoundedBox args={[0.24, 0.03, 0.52]} radius={0.03} smoothness={4} position={[0, 0.07, 0]} castShadow>
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={theme === "light" ? 0.03 : 0.08} roughness={0.74} />
      </RoundedBox>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 0.42, 14]} />
        <meshStandardMaterial color={frameColor} roughness={0.82} />
      </mesh>
      {[0, Math.PI / 2, Math.PI / 4, -Math.PI / 4].map((angle) => (
        <RoundedBox key={angle} args={[0.42, 0.03, 0.06]} radius={0.02} smoothness={4} position={[0, 0.04, 0]} rotation={[0, angle, 0]} castShadow>
          <meshStandardMaterial color={frameColor} roughness={0.82} />
        </RoundedBox>
      ))}
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((angle) => (
        <mesh key={`wheel-${angle}`} position={[Math.cos(angle) * 0.28, 0.02, Math.sin(angle) * 0.28]} rotation={[Math.PI / 2, 0, angle]}>
          <cylinderGeometry args={[0.04, 0.04, 0.05, 10]} />
          <meshStandardMaterial color={theme === "light" ? "#5b6575" : "#2f3744"} roughness={0.78} />
        </mesh>
      ))}
    </group>
  );
}

function CommandRoundTable({ theme, summary }) {
  return (
    <group position={[0, 0, 1.6]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]} receiveShadow>
        <ringGeometry args={[2.45, 3.15, 48]} />
        <meshStandardMaterial color={theme === "light" ? "#e4d7c6" : "#20252d"} roughness={0.92} />
      </mesh>

      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2.4, 2.62, 0.16, 48]} />
        <meshPhysicalMaterial
          color={theme === "light" ? "#d8bb94" : "#6d4c36"}
          roughness={0.44}
          metalness={0.08}
          clearcoat={0.22}
          clearcoatRoughness={0.28}
        />
      </mesh>
      <mesh position={[0, 0.38, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.52, 0.72, 24]} />
        <meshStandardMaterial color={theme === "light" ? "#c7b39b" : "#495260"} roughness={0.78} />
      </mesh>

      <mesh position={[0, 0.88, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.78, 0.82, 0.08, 36]} />
        <meshPhysicalMaterial
          color={theme === "light" ? "#f5f1ea" : "#dfe6ee"}
          roughness={0.18}
          metalness={0.06}
          clearcoat={0.34}
          clearcoatRoughness={0.12}
        />
      </mesh>
      <mesh position={[0, 1.02, 0]} castShadow>
        <boxGeometry args={[0.24, 0.18, 0.24]} />
        <meshStandardMaterial color={theme === "light" ? "#d9c9b5" : "#9aa4b2"} roughness={0.74} />
      </mesh>

      {[
        [0.12, 1.16, -0.04],
        [-0.1, 1.12, 0.06],
        [0.02, 1.26, 0.12],
      ].map(([x, y, z], index) => (
        <mesh key={`table-leaf-${index}`} position={[x, y, z]} rotation={[0, 0, index % 2 === 0 ? 0.45 : -0.45]} castShadow>
          <boxGeometry args={[0.22, 0.03, 0.11]} />
          <meshStandardMaterial color={index === 1 ? "#89bc82" : "#6ea56b"} roughness={0.84} />
        </mesh>
      ))}

      <TableStool theme={theme} position={[-3.02, 0, 0.2]} rotation={Math.PI / 2} />
      <TableStool theme={theme} position={[3.02, 0, 0.2]} rotation={-Math.PI / 2} />
      <TableStool theme={theme} position={[0, 0, -3.04]} />
      <TableStool theme={theme} position={[0, 0, 3.02]} rotation={Math.PI} />

      <Text position={[0, 1.78, -0.08]} fontSize={0.16} color={theme === "light" ? "#57534e" : "#e5e7eb"} anchorX="center" anchorY="middle">
        ClawLink Core
      </Text>
      <Text position={[0, 1.52, -0.08]} fontSize={0.1} color={theme === "light" ? "#78716c" : "#94a3b8"} anchorX="center" anchorY="middle">
        {summary.agents || 0} agents · {summary.sessions || 0} sessions · {summary.errors || 0} alerts
      </Text>
    </group>
  );
}

function DeskIdentityTag({ agent, theme, highlighted = false }) {
  const plateColor = theme === "light" ? "#fffdf8" : "#111b2b";
  const secondaryColor = theme === "light" ? "#4b5563" : "#cbd5e1";
  const nameColor = theme === "light" ? "#0f172a" : "#f8fafc";
  const outlineColor = theme === "light" ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.96)";

  return (
    <group position={[0.72, 1.14, 0.34]} rotation={[-0.12, -0.44, 0]} scale={1.08}>
      <RoundedBox args={[0.82, 0.34, 0.045]} radius={0.06} smoothness={4}>
        <meshPhysicalMaterial
          color={plateColor}
          roughness={0.16}
          metalness={0.1}
          clearcoat={0.92}
          clearcoatRoughness={0.14}
          transmission={theme === "light" ? 0.08 : 0.16}
          transparent
          opacity={theme === "light" ? 0.96 : 0.92}
          emissive={highlighted ? agent.color : "#000000"}
          emissiveIntensity={highlighted ? 0.12 : theme === "light" ? 0.015 : 0.04}
        />
      </RoundedBox>
      <RoundedBox args={[0.68, 0.034, 0.014]} radius={0.012} smoothness={2} position={[0, -0.104, 0.034]}>
        <meshStandardMaterial
          color={highlighted ? agent.color : theme === "light" ? "#d6ccc2" : "#243244"}
          emissive={highlighted ? agent.color : "#000000"}
          emissiveIntensity={highlighted ? 0.28 : theme === "light" ? 0 : 0.06}
        />
      </RoundedBox>
      <Text
        position={[-0.25, 0.05, 0.03]}
        fontSize={0.13}
        color={agent.color}
        outlineWidth={0.008}
        outlineColor={outlineColor}
        anchorX="center"
        anchorY="middle"
      >
        {agent.emoji || "✦"}
      </Text>
      <Text
        position={[-0.1, 0.055, 0.03]}
        fontSize={0.094}
        maxWidth={0.48}
        color={nameColor}
        outlineWidth={0.012}
        outlineColor={outlineColor}
        anchorX="left"
        anchorY="middle"
      >
        {shorten(agent.name, 10)}
      </Text>
      <Text
        position={[0, -0.055, 0.03]}
        fontSize={0.058}
        maxWidth={0.56}
        color={secondaryColor}
        outlineWidth={0.006}
        outlineColor={outlineColor}
        anchorX="center"
        anchorY="middle"
      >
        {shorten(agent.statusLabel || agent.status, 14)}
      </Text>
    </group>
  );
}

function AgentAvatar({ agent, position, highlighted = false }) {
  const pose = React.useMemo(() => getAgentPose(), []);

  return (
    <group position={position} scale={AVATAR_SCALE}>
      {highlighted ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
          <ringGeometry args={[0.42, 0.6, 32]} />
          <meshBasicMaterial color={agent.color} transparent opacity={0.34} />
        </mesh>
      ) : null}

      <RoundedBox args={[0.26, 0.12, 0.24]} radius={0.06} smoothness={4} position={[0, 0.76, 0.03]} castShadow>
        <meshStandardMaterial color={agent.color} roughness={0.72} />
      </RoundedBox>

      <mesh position={[0, 1.23, 0.02]} rotation={[pose.headLean, 0, 0]} castShadow>
        <sphereGeometry args={[0.18, 18, 18]} />
        <meshStandardMaterial color="#f3c3a7" roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.98, 0.03]} rotation={[0.16 + pose.bodyLean, 0, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.22, 0.46, 18]} />
        <meshStandardMaterial color={agent.color} roughness={0.68} />
      </mesh>

      <RoundedBox args={[0.08, 0.24, 0.08]} radius={0.03} smoothness={4} position={[-0.22, 0.98, -0.04]} rotation={[pose.armReach, 0, 0.1]} castShadow>
        <meshStandardMaterial color={agent.color} />
      </RoundedBox>
      <RoundedBox args={[0.08, 0.24, 0.08]} radius={0.03} smoothness={4} position={[0.22, 0.98, -0.04]} rotation={[pose.armReach, 0, -0.1]} castShadow>
        <meshStandardMaterial color={agent.color} />
      </RoundedBox>
      <RoundedBox args={[0.08, 0.18, 0.08]} radius={0.03} smoothness={4} position={[-0.28, 0.9, -0.14]} rotation={[pose.forearmLift, 0, 0.1]} castShadow>
        <meshStandardMaterial color="#f3c3a7" roughness={0.74} />
      </RoundedBox>
      <RoundedBox args={[0.08, 0.18, 0.08]} radius={0.03} smoothness={4} position={[0.28, 0.9, -0.14]} rotation={[pose.forearmLift, 0, -0.1]} castShadow>
        <meshStandardMaterial color="#f3c3a7" roughness={0.74} />
      </RoundedBox>

      <RoundedBox args={[0.08, 0.28, 0.08]} radius={0.03} smoothness={4} position={[-0.1, 0.52, -0.11]} rotation={[pose.legAngle, 0, 0]} castShadow>
        <meshStandardMaterial color="#475569" />
      </RoundedBox>
      <RoundedBox args={[0.08, 0.28, 0.08]} radius={0.03} smoothness={4} position={[0.1, 0.52, -0.11]} rotation={[pose.legAngle, 0, 0]} castShadow>
        <meshStandardMaterial color="#475569" />
      </RoundedBox>

      <RoundedBox args={[0.08, 0.24, 0.08]} radius={0.03} smoothness={4} position={[-0.1, 0.3, -0.24]} castShadow>
        <meshStandardMaterial color="#475569" />
      </RoundedBox>
      <RoundedBox args={[0.08, 0.24, 0.08]} radius={0.03} smoothness={4} position={[0.1, 0.3, -0.24]} castShadow>
        <meshStandardMaterial color="#475569" />
      </RoundedBox>

      <RoundedBox args={[0.12, 0.05, 0.18]} radius={0.03} smoothness={4} position={[-0.1, 0.15, -0.22]} castShadow>
        <meshStandardMaterial color="#1f2937" />
      </RoundedBox>
      <RoundedBox args={[0.12, 0.05, 0.18]} radius={0.03} smoothness={4} position={[0.1, 0.15, -0.22]} castShadow>
        <meshStandardMaterial color="#1f2937" />
      </RoundedBox>
    </group>
  );
}

function DeskPod({ slot, agent, theme, highlighted, onSelect, showRuntimePin = false }) {
  const [hovered, setHovered] = React.useState(false);
  const scale = (slot.scale || 1) * DESK_SCALE_BOOST;
  const showDispatchHint = slot.lane === "runtime" && (hovered || highlighted);
  const screenColor =
    agent.status === "error"
      ? "#6b1d1d"
      : agent.status === "working"
        ? "#0f3a21"
        : agent.status === "thinking"
          ? "#15284b"
          : "#1f2937";
  const active = agent.status === "working" || highlighted || hovered;
  useCursor(hovered);

  return (
    <group
      position={slot.desk}
      rotation={[0, slot.rotation, 0]}
      scale={scale}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.(agent.id);
      }}
    >
      <mesh
        position={[0, 1.06, 0.44]}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[2.4, 2.4, 2.4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <RoundedBox args={[2.18, 0.06, 1.28]} radius={0.12} smoothness={4} position={[0, 0.03, 0.04]} receiveShadow>
        <meshStandardMaterial color={theme === "light" ? "#e9e5df" : "#1c2027"} roughness={0.98} />
      </RoundedBox>

      <RoundedBox args={[1.82, 0.12, 0.82]} radius={0.08} smoothness={4} position={[0, 0.84, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={theme === "light" ? "#d7b791" : "#694936"} roughness={0.62} />
      </RoundedBox>
      {[-0.7, 0.7].flatMap((x) => [-0.24, 0.24].map((z) => [x, z])).map(([x, z], index) => (
        <RoundedBox key={`desk-leg-${index}`} args={[0.1, 0.74, 0.1]} radius={0.03} smoothness={4} position={[x, 0.37, z]} castShadow>
          <meshStandardMaterial color={theme === "light" ? "#b89c81" : "#553c2c"} roughness={0.76} />
        </RoundedBox>
      ))}

      <RoundedBox args={[0.74, 0.46, 0.06]} radius={0.04} smoothness={4} position={[0, 1.3, -0.24]} castShadow renderOrder={1}>
        <meshStandardMaterial color={theme === "light" ? "#dbe1ea" : "#10151d"} />
      </RoundedBox>
      <RoundedBox args={[0.6, 0.32, 0.008]} radius={0.025} smoothness={4} position={[0, 1.3, -0.168]} renderOrder={2}>
        <meshPhysicalMaterial
          color={screenColor}
          emissive={screenColor}
          emissiveIntensity={active ? 0.24 : 0.1}
          roughness={0.08}
          metalness={0.12}
          clearcoat={0.34}
          clearcoatRoughness={0.1}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-4}
        />
      </RoundedBox>
      <RoundedBox args={[0.34, 0.026, 0.008]} radius={0.01} smoothness={2} position={[-0.08, 1.36, -0.148]} renderOrder={3}>
        <meshStandardMaterial color="#f8fafc" emissive="#f8fafc" emissiveIntensity={0.12} />
      </RoundedBox>
      <RoundedBox args={[0.22, 0.026, 0.008]} radius={0.01} smoothness={2} position={[-0.14, 1.3, -0.148]} renderOrder={3}>
        <meshStandardMaterial color={active ? agent.color : "#94a3b8"} emissive={active ? agent.color : "#000000"} emissiveIntensity={active ? 0.16 : 0} />
      </RoundedBox>
      <RoundedBox args={[0.12, 0.026, 0.008]} radius={0.01} smoothness={2} position={[0.18, 1.3, -0.148]} renderOrder={3}>
        <meshStandardMaterial color={theme === "light" ? "#cbd5e1" : "#475569"} />
      </RoundedBox>

      <RoundedBox args={[0.56, 0.02, 0.18]} radius={0.02} smoothness={4} position={[0, 0.93, 0.14]} castShadow>
        <meshStandardMaterial color="#3b4452" />
      </RoundedBox>
      <RoundedBox args={[0.44, 0.08, 0.44]} radius={0.08} smoothness={4} position={[0, 0.42, 0.62]} castShadow>
        <meshStandardMaterial color={theme === "light" ? "#d8d1c7" : "#353942"} />
      </RoundedBox>
      <RoundedBox args={[0.42, 0.38, 0.1]} radius={0.06} smoothness={4} position={[0, 0.62, 0.46]} castShadow>
        <meshStandardMaterial color={theme === "light" ? "#d8d1c7" : "#353942"} />
      </RoundedBox>

      <OfficeChair theme={theme} position={[0, 0, 0.74]} rotation={Math.PI} accentColor={agent.color} />

      {[-0.2, 0, 0.2].map((offset, index) => (
        <RoundedBox
          key={`status-bar-${index}`}
          args={[0.12 + index * 0.08, 0.018, 0.018]}
          radius={0.008}
          smoothness={2}
          position={[-0.18 + index * 0.18, 1.02, -0.18]}
        >
          <meshStandardMaterial
            color={active ? agent.color : theme === "light" ? "#cbd5e1" : "#4b5563"}
            emissive={active ? agent.color : "#000000"}
            emissiveIntensity={active ? 0.62 : 0}
          />
        </RoundedBox>
      ))}

      <DeskIdentityTag agent={agent} theme={theme} highlighted={highlighted} />

      {showDispatchHint ? (
        <group>
          <RoundedBox args={[1.08, 0.22, 0.14]} radius={0.06} smoothness={4} position={[0, 2.12, 0.04]}>
            <meshStandardMaterial
              color={theme === "light" ? "#fffaf5" : "#111827"}
              emissive={agent.color}
              emissiveIntensity={theme === "light" ? 0.06 : 0.22}
            />
          </RoundedBox>
          <Text position={[0, 2.14, 0.14]} fontSize={0.1} color={theme === "light" ? "#171717" : "#f8fafc"} anchorX="center" anchorY="middle">
            点击调度
          </Text>
        </group>
      ) : null}

      {showRuntimePin && slot.lane === "runtime" && (hovered || highlighted) ? (
        <Html position={[0, 2.34, 0.12]} center style={{ pointerEvents: "auto" }}>
          <button
            type="button"
            className={`scene-runtime-pin ${showDispatchHint ? "active" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.(agent.id);
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <span>{agent.emoji || "🤖"}</span>
            <strong>{shorten(agent.name, 12)}</strong>
            <small>调度</small>
          </button>
        </Html>
      ) : null}

      <AgentAvatar agent={agent} position={[0, 0, 0.72]} highlighted={highlighted} />
    </group>
  );
}

function SignalCable({ from, to, color, active }) {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = -Math.atan2(dz, dx);
  const midpoint = [(from[0] + to[0]) / 2, 0.03, (from[2] + to[2]) / 2];

  return (
    <mesh position={midpoint} rotation={[0, angle, 0]} receiveShadow>
      <boxGeometry args={[length, 0.025, 0.025]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 0.38 : 0.06} transparent opacity={active ? 0.2 : 0.05} />
    </mesh>
  );
}

function CeilingLightRig({ theme }) {
  const stripColor = theme === "light" ? "#fff7ed" : "#f8c68b";

  return (
    <group>
      {[-7.4, 0, 7.4].map((z) => (
        <RoundedBox key={`light-strip-${z}`} args={[8.6, 0.08, 0.16]} radius={0.04} smoothness={4} position={[0, 7.34, z]}>
          <meshStandardMaterial color={stripColor} emissive={stripColor} emissiveIntensity={theme === "light" ? 0.26 : 0.62} />
        </RoundedBox>
      ))}
      {[-12.2, 12.2].map((x) => (
        <RoundedBox key={`meeting-light-${x}`} args={[2.4, 0.08, 0.16]} radius={0.04} smoothness={4} position={[x, 7.16, 0]}>
          <meshStandardMaterial color={theme === "light" ? "#fffaf4" : "#cbd5e1"} emissive={theme === "light" ? "#fffaf4" : "#8ab4ff"} emissiveIntensity={theme === "light" ? 0.18 : 0.36} />
        </RoundedBox>
      ))}
    </group>
  );
}

function WallStatusRack({ theme, summary }) {
  const stats = [
    ["AGENTS", summary.agents || 0, "#ec4899"],
    ["ACTIVE", summary.activeAgents || 0, "#22c55e"],
    ["SESSIONS", summary.sessions || 0, "#60a5fa"],
    ["ERRORS", summary.errors || 0, "#f97316"],
  ];

  return (
    <group position={[10.8, 3.58, BACK_GLASS_Z + 0.26]}>
      {stats.map((stat, index) => (
        <group key={stat[0]} position={[index * 1.5, 0, 0]}>
          <RoundedBox args={[1.12, 0.78, 0.08]} radius={0.08} smoothness={4}>
            <meshStandardMaterial color={theme === "light" ? "#fffaf4" : "#111827"} emissive={stat[2]} emissiveIntensity={theme === "light" ? 0.04 : 0.14} />
          </RoundedBox>
          <Text position={[0, 0.14, 0.055]} fontSize={0.11} color={theme === "light" ? "#6b7280" : "#cbd5e1"} anchorX="center" anchorY="middle">
            {stat[0]}
          </Text>
          <Text position={[0, -0.14, 0.055]} fontSize={0.22} color={stat[2]} anchorX="center" anchorY="middle">
            {String(stat[1])}
          </Text>
        </group>
      ))}
    </group>
  );
}

function CameraRig({ preset, orbitLimits }) {
  const controlsRef = React.useRef(null);
  const { camera, invalidate } = useThree();
  const targetPositionRef = React.useRef(new Vector3(...preset.position));
  const targetLookAtRef = React.useRef(new Vector3(...preset.target));
  const targetFovRef = React.useRef(preset.fov);
  const hasInitializedRef = React.useRef(false);
  const isTransitioningRef = React.useRef(false);

  React.useEffect(() => {
    const presetChanged =
      !isVectorCloseToArray(targetPositionRef.current, preset.position) ||
      !isVectorCloseToArray(targetLookAtRef.current, preset.target) ||
      Math.abs(targetFovRef.current - preset.fov) > 0.001;

    if (hasInitializedRef.current && !presetChanged) return;

    targetPositionRef.current.set(...preset.position);
    targetLookAtRef.current.set(...preset.target);
    targetFovRef.current = preset.fov;

    if (!hasInitializedRef.current) {
      camera.position.set(...preset.position);
      camera.fov = preset.fov;
      camera.updateProjectionMatrix();

      if (controlsRef.current) {
        controlsRef.current.target.set(...preset.target);
        controlsRef.current.update();
      }

      hasInitializedRef.current = true;
      isTransitioningRef.current = false;
      return;
    }

    isTransitioningRef.current = true;
    invalidate();
  }, [camera, invalidate, preset]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls || !isTransitioningRef.current) return;
    invalidate();

    const alpha = 1 - Math.exp(-delta * CAMERA_TRANSITION_SPEED);
    camera.position.lerp(targetPositionRef.current, alpha);
    controls.target.lerp(targetLookAtRef.current, alpha);
    const nextFov = MathUtils.lerp(camera.fov, targetFovRef.current, alpha);
    if (Math.abs(nextFov - camera.fov) > 0.0001) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }

    const positionSettled = camera.position.distanceToSquared(targetPositionRef.current) < 0.0008;
    const targetSettled = controls.target.distanceToSquared(targetLookAtRef.current) < 0.0008;
    const fovSettled = Math.abs(camera.fov - targetFovRef.current) < 0.02;

    if (positionSettled && targetSettled && fovSettled) {
      camera.position.copy(targetPositionRef.current);
      controls.target.copy(targetLookAtRef.current);
      if (Math.abs(camera.fov - targetFovRef.current) > 0.0001) {
        camera.fov = targetFovRef.current;
        camera.updateProjectionMatrix();
      }
      isTransitioningRef.current = false;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.82}
      minDistance={ORBIT_MIN_DISTANCE}
      maxDistance={ORBIT_MAX_DISTANCE}
      minPolarAngle={ORBIT_MIN_POLAR}
      maxPolarAngle={ORBIT_MAX_POLAR}
      minAzimuthAngle={orbitLimits.minAzimuthAngle}
      maxAzimuthAngle={orbitLimits.maxAzimuthAngle}
      onStart={() => {
        isTransitioningRef.current = false;
      }}
    />
  );
}

function OfficeScene({ agents, theme, highlightId, summary, onSelect, cameraPreset }) {
  const { systemAgents, runtimeAgents, systemAgentMap, runtimeAgentMap } = React.useMemo(() => {
    const system = [];
    const runtime = [];

    agents.forEach((agent) => {
      if (agent.kind === "openclaw-agent") {
        runtime.push(agent);
      } else {
        system.push(agent);
      }
    });

    return {
      systemAgents: system,
      runtimeAgents: runtime,
      systemAgentMap: new Map(system.map((agent) => [agent.id, agent])),
      runtimeAgentMap: new Map(runtime.map((agent) => [agent.id, agent])),
    };
  }, [agents]);
  const runtimeDeskSlots = React.useMemo(() => buildRuntimeDeskSlots(runtimeAgents), [runtimeAgents]);
  const gatewaySlot = SYSTEM_DESK_SLOTS.find((slot) => slot.id === "gateway");
  const agentHubSlot = SYSTEM_DESK_SLOTS.find((slot) => slot.id === "agents");
  const showRuntimePins = cameraPreset === "agents";

  return (
    <>
      <color attach="background" args={[theme === "light" ? "#eef2f4" : "#08111b"]} />
      <fog attach="fog" args={[theme === "light" ? "#eef2f4" : "#08111b", 30, 66]} />

      <ambientLight intensity={theme === "light" ? 1.12 : 1.34} />
      <hemisphereLight intensity={theme === "light" ? 0.6 : 0.98} color={theme === "light" ? "#fffaf5" : "#9ed6ff"} groundColor={theme === "light" ? "#d0b79a" : "#604334"} />
      <directionalLight position={[11, 15, 9]} intensity={theme === "light" ? 1.64 : 2.06} castShadow shadow-mapSize-width={1536} shadow-mapSize-height={1536} />
      <pointLight position={[0, 6.2, 0.8]} intensity={theme === "light" ? 0.96 : 1.32} color={theme === "light" ? "#fff7ed" : "#ffd8b1"} />
      <pointLight position={[-12.2, 4.8, -2.2]} intensity={theme === "light" ? 0.42 : 0.82} color={theme === "light" ? "#ffffff" : "#7dd3fc"} />
      <pointLight position={[12.2, 4.8, -2.2]} intensity={theme === "light" ? 0.42 : 0.82} color={theme === "light" ? "#ffffff" : "#a5b4fc"} />
      <pointLight position={[0, 3.4, 13.2]} intensity={theme === "light" ? 0.26 : 0.54} color={theme === "light" ? "#f3eadc" : "#f2b78a"} />

      <OfficeFloor theme={theme} />
      <TerraceReflectingPool theme={theme} />
      <OfficeShell theme={theme} />
      <CeilingLightRig theme={theme} />
      <CommandCanopy theme={theme} />
      <MeetingWing position={[-12.1, 0, -0.2]} theme={theme} title="Strategy Room" accent="#60a5fa" />
      <MeetingWing position={[12.1, 0, -0.2]} theme={theme} mirror title="Operations Room" accent="#a78bfa" />
      <CommandRoundTable theme={theme} summary={summary} />
      <ExecutiveBench position={[-11.2, 0, 13.1]} theme={theme} />
      <ExecutiveBench position={[11.2, 0, 13.1]} theme={theme} mirror />
      <LobbySculpture theme={theme} />
      <WallStatusRack theme={theme} summary={summary} />

      {gatewaySlot
        ? SYSTEM_DESK_SLOTS.filter((slot) => slot.id !== "gateway").map((slot) => {
            const agent = systemAgentMap.get(slot.id);
            return (
              <SignalCable
                key={`${slot.id}-signal`}
                from={gatewaySlot.desk}
                to={slot.desk}
                color={agent?.color || "#60a5fa"}
                active={agent?.status === "working" || highlightId === slot.id}
              />
            );
          })
        : null}

      {agentHubSlot
        ? runtimeDeskSlots.map((slot) => {
            const agent = runtimeAgentMap.get(slot.id);
            return (
              <SignalCable
                key={`${slot.id}-agent-signal`}
                from={agentHubSlot.desk}
                to={slot.desk}
                color={agent?.color || "#ec4899"}
                active={agent?.status === "working" || highlightId === slot.id}
              />
            );
          })
        : null}

      {SYSTEM_DESK_SLOTS.map((slot) => {
        const agent = systemAgentMap.get(slot.id);
        if (!agent) return null;
        return <DeskPod key={slot.id} slot={slot} agent={agent} theme={theme} highlighted={highlightId === slot.id} onSelect={onSelect} />;
      })}

      {runtimeDeskSlots.map((slot) => {
        const agent = runtimeAgentMap.get(slot.id);
        if (!agent) return null;
        return (
          <DeskPod
            key={slot.id}
            slot={slot}
            agent={agent}
            theme={theme}
            highlighted={highlightId === slot.id}
            onSelect={onSelect}
            showRuntimePin={showRuntimePins}
          />
        );
      })}
    </>
  );
}

function ClawLinkOffice3D({ agents = [], theme = "dark", cameraPreset = "overview", highlightId, summary = {}, onSelect }) {
  const preset = React.useMemo(() => {
    const basePreset = CAMERA_PRESETS[cameraPreset] || CAMERA_PRESETS.overview;

    if (cameraPreset !== "agents" || !highlightId?.startsWith("agent-")) {
      return basePreset;
    }

    const runtimeAgents = agents.filter((agent) => agent.kind === "openclaw-agent");
    const targetSlot = buildRuntimeDeskSlots(runtimeAgents).find((slot) => slot.id === highlightId);
    return targetSlot ? buildAgentCameraPreset(targetSlot) : basePreset;
  }, [agents, cameraPreset, highlightId]);
  const orbitLimits = React.useMemo(() => getOrbitLimits(preset), [preset]);

  return (
    <div className="clawlink-office-canvas">
      <Canvas
        frameloop="demand"
        shadows
        dpr={[1, 1.25]}
        gl={{ toneMappingExposure: theme === "light" ? 1 : 1.24, powerPreference: "high-performance", antialias: true }}
        camera={{ position: preset.position, fov: preset.fov }}
      >
        <OfficeScene agents={agents} theme={theme} highlightId={highlightId} summary={summary} onSelect={onSelect} cameraPreset={cameraPreset} />
        <CameraRig preset={preset} orbitLimits={orbitLimits} />
      </Canvas>
    </div>
  );
}

export default React.memo(ClawLinkOffice3D);
