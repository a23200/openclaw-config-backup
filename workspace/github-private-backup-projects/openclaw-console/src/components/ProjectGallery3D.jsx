import React from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Environment,
  Html,
  MeshReflectorMaterial,
  OrbitControls,
  RoundedBox,
  Stars,
  Text,
  useCursor,
} from "@react-three/drei";
import { ACESFilmicToneMapping, CanvasTexture, RepeatWrapping, Vector3 } from "three";

const CAMERA_PRESET = {
  position: [-13.8, 8.6, 18],
  target: [0, 1.5, 1.2],
  fov: 30,
};

const ORBIT_MIN_POLAR = Math.PI / 5.9;
const ORBIT_MAX_POLAR = Math.PI / 2.34;
const ORBIT_MIN_DISTANCE = 9.2;
const ORBIT_MAX_DISTANCE = 32;

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

const DESK_SLOTS = [
  { position: [0, 0, -9.1], rotation: 0 },
  { position: [-7.1, 0, -4.8], rotation: Math.PI / 2 },
  { position: [7.1, 0, -4.8], rotation: -Math.PI / 2 },
  { position: [-7.1, 0, 4.8], rotation: Math.PI / 2 },
  { position: [7.1, 0, 4.8], rotation: -Math.PI / 2 },
  { position: [0, 0, 9.5], rotation: Math.PI },
  { position: [-6.4, 0, 10.8], rotation: Math.PI },
  { position: [-11.8, 0, 0], rotation: Math.PI / 2 },
  { position: [11.8, 0, 0], rotation: -Math.PI / 2 },
];

const PATROL_ROUTES = [
  {
    id: "west",
    label: "西区巡视",
    color: "#38bdf8",
    points: [
      [-12.8, 0, 11.2],
      [-12.8, 0, 4.2],
      [-12.8, 0, 0],
      [-11.2, 0, -6.4],
      [-6.4, 0, -8.8],
      [-4.8, 0, -3.8],
      [-4.8, 0, 3.8],
      [-6.4, 0, 9.8],
    ],
  },
  {
    id: "center",
    label: "中庭巡视",
    color: "#22d3ee",
    points: [
      [-4.6, 0, 11.6],
      [0, 0, 11.6],
      [4.6, 0, 11.6],
      [6.4, 0, 7.2],
      [6.4, 0, 2.2],
      [4.6, 0, -3.8],
      [0, 0, -8.6],
      [-4.6, 0, -3.8],
      [-6.4, 0, 2.2],
      [-6.4, 0, 7.2],
    ],
  },
  {
    id: "east",
    label: "东区巡视",
    color: "#818cf8",
    points: [
      [12.8, 0, 11.2],
      [12.8, 0, 4.2],
      [12.8, 0, 0],
      [11.2, 0, -6.4],
      [6.4, 0, -8.8],
      [4.8, 0, -3.8],
      [4.8, 0, 3.8],
      [6.4, 0, 9.8],
    ],
  },
];

function shorten(value, maxLength = 24) {
  if (typeof value !== "string") return "";
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function distance2D(left, right) {
  return Math.hypot((left?.[0] || 0) - (right?.[0] || 0), (left?.[2] || 0) - (right?.[2] || 0));
}

function buildDeskInspectPoint(slot) {
  if (!slot) return null;

  const forwardX = Math.sin(slot.rotation || 0);
  const forwardZ = Math.cos(slot.rotation || 0);
  const position = [
    slot.position[0] + forwardX * 1.78,
    0,
    slot.position[2] + forwardZ * 1.78,
  ];

  return {
    position,
    lookAt: [slot.position[0], 0.96, slot.position[2]],
    projectId: slot.project?.id || "",
    label: slot.project?.role || slot.project?.name || "目标工位",
    routeId: findNearestRouteId({ position }),
  };
}

function buildDeskFocusPoint(slot) {
  if (!slot) return null;
  const forwardX = Math.sin(slot.rotation || 0);
  const forwardZ = Math.cos(slot.rotation || 0);
  return {
    id: slot.project?.id || "",
    cameraPosition: [
      slot.position[0] + forwardX * 4.6,
      3.2,
      slot.position[2] + forwardZ * 4.6,
    ],
    lookAt: [slot.position[0], 1.1, slot.position[2]],
  };
}

function findNearestRouteId(target) {
  if (!target?.position) return "";

  let nearestRouteId = "";
  let nearestDistance = Number.POSITIVE_INFINITY;

  PATROL_ROUTES.forEach((route) => {
    route.points.forEach((point) => {
      const nextDistance = distance2D(point, target.position);
      if (nextDistance < nearestDistance) {
        nearestDistance = nextDistance;
        nearestRouteId = route.id;
      }
    });
  });

  return nearestRouteId;
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
          <meshStandardMaterial
            color={index % 3 === 0 ? "#74a970" : index % 3 === 1 ? "#4f8a58" : "#89bc82"}
            roughness={0.84}
          />
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

function RoundBush({ position, theme, scale = 1, tint }) {
  const green = tint || (theme === "light" ? "#7bb07a" : "#3f6a4e");
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.42, 0]} castShadow>
        <sphereGeometry args={[0.58, 10, 8]} />
        <meshStandardMaterial color={green} roughness={0.92} />
      </mesh>
      <mesh position={[0.36, 0.3, 0.18]} castShadow>
        <sphereGeometry args={[0.38, 8, 6]} />
        <meshStandardMaterial color={theme === "light" ? "#8cbe84" : "#4a7a56"} roughness={0.92} />
      </mesh>
      <mesh position={[-0.34, 0.28, -0.12]} castShadow>
        <sphereGeometry args={[0.34, 8, 6]} />
        <meshStandardMaterial color={theme === "light" ? "#6ea167" : "#38644a"} roughness={0.92} />
      </mesh>
    </group>
  );
}

function PolarTree({ position, theme, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 2.2, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.12, 4.4, 8]} />
        <meshStandardMaterial color={theme === "light" ? "#8d6b4e" : "#4f3e30"} roughness={0.92} />
      </mesh>
      <mesh position={[0, 4.5, 0]} castShadow>
        <capsuleGeometry args={[0.72, 2.8, 4, 8]} />
        <meshStandardMaterial color={theme === "light" ? "#75a872" : "#406a4d"} roughness={0.94} />
      </mesh>
    </group>
  );
}

function LampPost({ position, theme, height = 3.4 }) {
  const bulbColor = theme === "light" ? "#fff2c2" : "#ffd88a";
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.09, height, 8]} />
        <meshStandardMaterial color={theme === "light" ? "#3a3a3a" : "#1b1f28"} roughness={0.68} metalness={0.3} />
      </mesh>
      <mesh position={[0, height + 0.08, 0]} castShadow>
        <sphereGeometry args={[0.22, 12, 10]} />
        <meshStandardMaterial
          color={bulbColor}
          emissive={bulbColor}
          emissiveIntensity={theme === "light" ? 0.45 : 1.3}
        />
      </mesh>
      <pointLight
        position={[0, height + 0.08, 0]}
        intensity={theme === "light" ? 0.22 : 0.6}
        distance={5.2}
        color={bulbColor}
      />
    </group>
  );
}

const DistantBuilding = React.memo(function DistantBuilding({
  position,
  width,
  depth,
  height,
  theme,
  accent = false,
}) {
  const wallColor = theme === "light"
    ? accent ? "#c8cfd8" : "#b9c1ca"
    : accent ? "#1f2a38" : "#141a24";
  const windowColor = theme === "light" ? "#f5ecd6" : "#ffd791";
  const windows = React.useMemo(() => {
    const rows = Math.max(3, Math.floor(height / 1.4));
    const cols = Math.max(2, Math.floor(width / 1.2));
    const list = [];
    for (let idx = 0; idx < rows * cols; idx += 1) {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const wy = 1.2 + row * (height - 1.6) / Math.max(1, rows - 1);
      const wx = -width / 2 + 0.6 + col * (width - 1.2) / Math.max(1, cols - 1);
      const lit = theme === "dark" ? (idx * 131 % 7) > 2 : (idx * 83 % 11) > 3;
      list.push({ idx, wx, wy, lit });
    }
    return list;
  }, [width, height, theme]);
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={wallColor} roughness={0.86} />
      </mesh>
      <mesh position={[0, height + 0.12, 0]}>
        <boxGeometry args={[width * 0.62, 0.24, depth * 0.62]} />
        <meshStandardMaterial color={theme === "light" ? "#a8b0b8" : "#0c1118"} roughness={0.9} />
      </mesh>
      {windows.map(({ idx, wx, wy, lit }) => (
        <mesh key={`win-${idx}`} position={[wx, wy, depth / 2 + 0.01]}>
          <planeGeometry args={[0.38, 0.52]} />
          <meshStandardMaterial
            color={lit ? windowColor : (theme === "light" ? "#8d96a0" : "#1c2635")}
            emissive={lit ? windowColor : "#000000"}
            emissiveIntensity={lit ? (theme === "light" ? 0.14 : 0.85) : 0}
            roughness={0.4}
          />
        </mesh>
      ))}
    </group>
  );
});

function CityRing({ theme }) {
  const ring = React.useMemo(() => {
    const items = [];
    const radii = [52, 58, 64];
    const counts = [14, 18, 22];
    radii.forEach((radius, r) => {
      const count = counts[r];
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + r * 0.12;
        const jitter = ((i * 37 + r * 7) % 11) / 11;
        const x = Math.cos(angle) * (radius + jitter * 2.4 - 1.2);
        const z = Math.sin(angle) * (radius + jitter * 2.4 - 1.2);
        const height = 6 + ((i * 13 + r * 3) % 9) * 1.1 + r * 1.6;
        const width = 2.6 + ((i * 29) % 7) * 0.4;
        const depth = 2.6 + ((i * 19) % 5) * 0.4;
        items.push({ x, z, height, width, depth, accent: (i + r) % 3 === 0, key: `${r}-${i}` });
      }
    });
    return items;
  }, []);

  return (
    <group>
      {ring.map((b) => (
        <DistantBuilding
          key={b.key}
          position={[b.x, 0, b.z]}
          width={b.width}
          depth={b.depth}
          height={b.height}
          theme={theme}
          accent={b.accent}
        />
      ))}
    </group>
  );
}

function ExteriorGarden({ theme }) {
  const plants = React.useMemo(() => {
    const items = [];
    const sides = [
      { x: -SIDE_GLASS_X - 3.4, zStart: OFFICE_BACK_Z + 2, zEnd: OFFICE_FRONT_Z - 2 },
      { x: SIDE_GLASS_X + 3.4, zStart: OFFICE_BACK_Z + 2, zEnd: OFFICE_FRONT_Z - 2 },
    ];
    sides.forEach((side, sIdx) => {
      const step = 3.4;
      for (let z = side.zStart; z <= side.zEnd; z += step) {
        const jitter = ((z * 13 + sIdx * 7) % 10) / 10;
        const kind = Math.floor((z * 7 + sIdx * 3) % 3);
        items.push({
          kind,
          x: side.x + (jitter - 0.5) * 1.1,
          z,
          scale: 0.78 + jitter * 0.4,
          key: `side-${sIdx}-${z.toFixed(1)}`,
        });
      }
    });
    const frontXs = [-14, -10.4, -6.5, 6.5, 10.4, 14];
    frontXs.forEach((x, idx) => {
      items.push({
        kind: idx % 2,
        x,
        z: OFFICE_FRONT_Z + 3.8 + (idx % 2) * 0.8,
        scale: 0.9 + (idx % 3) * 0.2,
        key: `front-${idx}`,
      });
    });
    return items;
  }, []);

  return (
    <group>
      {plants.map((p) =>
        p.kind === 0 ? (
          <RoundBush key={p.key} position={[p.x, 0, p.z]} theme={theme} scale={p.scale} />
        ) : p.kind === 1 ? (
          <PolarTree key={p.key} position={[p.x, 0, p.z]} theme={theme} scale={p.scale} />
        ) : (
          <ExteriorTree key={p.key} position={[p.x, 0, p.z]} theme={theme} scale={p.scale} />
        )
      )}
    </group>
  );
}

function EntrancePlaza({ theme }) {
  const stoneColor = theme === "light" ? "#d9d0c1" : "#2a313c";
  const pathColor = theme === "light" ? "#e5ddcf" : "#303844";
  const edgeColor = theme === "light" ? "#bcae96" : "#1a1f28";

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, OFFICE_FRONT_Z + 4.4]} receiveShadow>
        <planeGeometry args={[OFFICE_WIDTH + 3.2, 9.4]} />
        <meshStandardMaterial color={stoneColor} roughness={0.92} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.008, OFFICE_FRONT_Z + 5.6]} receiveShadow>
        <planeGeometry args={[5.4, 7.6]} />
        <meshStandardMaterial
          color={pathColor}
          emissive={theme === "light" ? "#fff5dc" : "#4d3520"}
          emissiveIntensity={theme === "light" ? 0.04 : 0.22}
          roughness={0.78}
        />
      </mesh>

      {[-0.85, 0.85].map((offset) => (
        <mesh
          key={`edge-${offset}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[offset * 3.2, -0.005, OFFICE_FRONT_Z + 5.6]}
          receiveShadow
        >
          <planeGeometry args={[0.22, 7.6]} />
          <meshStandardMaterial color={edgeColor} roughness={0.9} />
        </mesh>
      ))}

      {[-2.2, 2.2].map((x) =>
        [OFFICE_FRONT_Z + 2.4, OFFICE_FRONT_Z + 6.4, OFFICE_FRONT_Z + 9.2].map((z) => (
          <LampPost key={`lamp-front-${x}-${z}`} position={[x, 0, z]} theme={theme} height={3.6} />
        ))
      )}

      <mesh position={[0, 0.02, OFFICE_FRONT_Z + 0.6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[6.8, 1.4]} />
        <meshStandardMaterial
          color={theme === "light" ? "#f3eadb" : "#20232b"}
          roughness={0.6}
        />
      </mesh>

      <group position={[0, 0, OFFICE_FRONT_Z + 11.4]}>
        <mesh position={[0, 1.1, 0]} castShadow>
          <boxGeometry args={[2.2, 2.2, 0.18]} />
          <meshStandardMaterial
            color={theme === "light" ? "#1f2937" : "#0d1017"}
            roughness={0.38}
            metalness={0.3}
          />
        </mesh>
        <mesh position={[-1.4, 1.1, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 2.2, 8]} />
          <meshStandardMaterial color={theme === "light" ? "#4b5563" : "#1c232e"} roughness={0.6} />
        </mesh>
        <mesh position={[1.4, 1.1, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 2.2, 8]} />
          <meshStandardMaterial color={theme === "light" ? "#4b5563" : "#1c232e"} roughness={0.6} />
        </mesh>
        <Html
          position={[0, 1.1, 0.12]}
          center
          distanceFactor={9}
          transform
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          <div
            style={{
              textAlign: "center",
              fontFamily:
                "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
              color: theme === "light" ? "#f8fafc" : "#fef3c7",
              whiteSpace: "nowrap",
              letterSpacing: 2,
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700 }}>ClawLink HQ</div>
            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.86 }}>AI 一人公司 · 随叫随到</div>
          </div>
        </Html>
      </group>
    </group>
  );
}

function SidewalkRing({ theme }) {
  const sidewalkColor = theme === "light" ? "#d6cdbe" : "#252b35";
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.028, 0]} receiveShadow>
        <ringGeometry args={[24, 36, 72]} />
        <meshStandardMaterial color={sidewalkColor} roughness={0.92} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <ringGeometry args={[36, 48, 72]} />
        <meshStandardMaterial
          color={theme === "light" ? "#d8e0cf" : "#14202a"}
          roughness={0.96}
        />
      </mesh>
    </group>
  );
}

function SkyDome({ theme }) {
  return (
    <mesh renderOrder={-1}>
      <sphereGeometry args={[120, 40, 24]} />
      <meshBasicMaterial
        color={theme === "light" ? "#e8f1f6" : "#050a14"}
        side={1}
        depthWrite={false}
      />
    </mesh>
  );
}

function OfficeFloor({ theme }) {
  const concreteTexture = React.useMemo(() => buildMicrocementTexture(theme), [theme]);
  const woodTexture = React.useMemo(() => buildWoodTexture(theme), [theme]);
  React.useEffect(() => {
    return () => {
      concreteTexture?.dispose?.();
      woodTexture?.dispose?.();
    };
  }, [concreteTexture, woodTexture]);
  const accentColor = theme === "light" ? "#e8ddcd" : "#20242d";

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.035, 0]} receiveShadow>
        <planeGeometry args={[OFFICE_WIDTH + 16, OFFICE_DEPTH + 18]} />
        <meshStandardMaterial color={theme === "light" ? "#eef1f1" : "#0b1018"} roughness={1} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[OFFICE_WIDTH + 4.2, OFFICE_DEPTH + 4.2]} />
        <meshStandardMaterial
          map={concreteTexture}
          color={theme === "light" ? "#f3eee8" : "#23262d"}
          roughness={0.94}
          metalness={0.03}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -0.8]} receiveShadow>
        <planeGeometry args={[18.2, 12.6]} />
        <MeshReflectorMaterial
          map={woodTexture}
          color={theme === "light" ? "#f1e6d6" : "#4b3424"}
          blur={[420, 110]}
          resolution={768}
          mixBlur={0.8}
          mixStrength={theme === "light" ? 0.6 : 1.2}
          mixContrast={1}
          depthScale={0.8}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          metalness={0.24}
          roughness={0.72}
          mirror={theme === "light" ? 0.12 : 0.28}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, -10.1]} receiveShadow>
        <planeGeometry args={[25.2, 4.6]} />
        <meshStandardMaterial map={woodTexture} color={theme === "light" ? "#f2e8da" : "#5f4332"} roughness={0.74} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 12.5]} receiveShadow>
        <planeGeometry args={[28.2, 4.8]} />
        <meshStandardMaterial color={theme === "light" ? "#ece4d7" : "#242933"} roughness={0.9} />
      </mesh>

      {[-2.78, 2.78].map((x) => (
        <mesh key={`brass-${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, 5.9]} receiveShadow>
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
        <meshStandardMaterial
          color={theme === "light" ? "#cfb79a" : "#7d5940"}
          emissive={theme === "light" ? "#fff7ed" : "#7d5940"}
          emissiveIntensity={theme === "light" ? 0.05 : 0.12}
        />
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

      {[-1, 1].map((sign) => (
        <group key={`side-glass-${sign}`} position={[sign * SIDE_GLASS_X, 3.12, 0.8]}>
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
            <FrameBar
              key={`side-frame-${sign}-${z}`}
              position={[0, 0, z]}
              args={[0.12, 6, 0.12]}
              color={frameColor}
            />
          ))}
        </group>
      ))}

      {[-8.8, 8.8].map((x) => (
        <React.Fragment key={`entry-${x}`}>
          <FrameBar position={[x, 3.1, OFFICE_FRONT_Z - 0.5]} args={[0.2, 6.1, 0.2]} color={frameColor} />
          <FrameBar position={[x, 0.72, OFFICE_FRONT_Z - 0.5]} args={[0.76, 1.36, 0.18]} color={frameDark} />
        </React.Fragment>
      ))}
      <FrameBar position={[0, 6.2, OFFICE_FRONT_Z - 0.5]} args={[17.8, 0.18, 0.18]} color={frameColor} />

      <RoundedBox
        args={[8.4, 0.2, 0.18]}
        radius={0.04}
        smoothness={4}
        position={[0, 4.32, BACK_GLASS_Z + 0.1]}
      >
        <meshStandardMaterial
          color={theme === "light" ? "#fffaf4" : "#151922"}
          emissive={theme === "light" ? "#ffffff" : "#15283d"}
          emissiveIntensity={theme === "light" ? 0.04 : 0.12}
        />
      </RoundedBox>
      {[-5.4, 5.4].map((x) => (
        <RoundedBox
          key={`feature-light-${x}`}
          args={[0.18, 2.8, 0.12]}
          radius={0.05}
          smoothness={4}
          position={[x, 2.56, BACK_GLASS_Z + 0.16]}
        >
          <meshStandardMaterial
            color={theme === "light" ? "#f6ead8" : "#f2b78a"}
            emissive={theme === "light" ? "#f6ead8" : "#f2b78a"}
            emissiveIntensity={theme === "light" ? 0.14 : 0.36}
          />
        </RoundedBox>
      ))}
      <Html
        position={[0, 4.48, BACK_GLASS_Z + 0.18]}
        center
        distanceFactor={9}
        transform
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div
          style={{
            textAlign: "center",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
            color: signColor,
            whiteSpace: "nowrap",
            textShadow: theme === "light" ? "none" : "0 2px 8px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: 2 }}>
            ClawLink · AI 一人公司
          </div>
          <div
            style={{
              fontSize: 15,
              marginTop: 4,
              color: theme === "light" ? "#6b7280" : "#94a3b8",
              letterSpacing: 2,
            }}
          >
            一人撑起一家 AI 公司
          </div>
        </div>
      </Html>

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
        <mesh
          key={`pool-strip-${x}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[x, 0.05, -2.2]}
          receiveShadow
        >
          <planeGeometry args={[1.24, 0.12]} />
          <meshStandardMaterial
            color={theme === "light" ? "#f3eadc" : "#ffcf9c"}
            emissive={theme === "light" ? "#f3eadc" : "#ffcf9c"}
            emissiveIntensity={theme === "light" ? 0.04 : 0.18}
          />
        </mesh>
      ))}
    </group>
  );
}

function CeilingLightRig({ theme }) {
  const stripColor = theme === "light" ? "#fff7ed" : "#f8c68b";

  return (
    <group>
      {[-7.4, 0, 7.4].map((z) => (
        <RoundedBox
          key={`light-strip-${z}`}
          args={[8.6, 0.08, 0.16]}
          radius={0.04}
          smoothness={4}
          position={[0, 7.34, z]}
        >
          <meshStandardMaterial
            color={stripColor}
            emissive={stripColor}
            emissiveIntensity={theme === "light" ? 0.26 : 0.62}
          />
        </RoundedBox>
      ))}
      {[-12.2, 12.2].map((x) => (
        <RoundedBox
          key={`meeting-light-${x}`}
          args={[2.4, 0.08, 0.16]}
          radius={0.04}
          smoothness={4}
          position={[x, 7.16, 0]}
        >
          <meshStandardMaterial
            color={theme === "light" ? "#fffaf4" : "#cbd5e1"}
            emissive={theme === "light" ? "#fffaf4" : "#8ab4ff"}
            emissiveIntensity={theme === "light" ? 0.18 : 0.36}
          />
        </RoundedBox>
      ))}
    </group>
  );
}

function CommandCanopy({ theme }) {
  const lightColor = theme === "light" ? "#f7efe3" : "#ffcc9a";
  const frameColor = theme === "light" ? "#c4ae93" : "#4d5565";

  return (
    <group position={[0, 5.7, 1.6]}>
      {[[-1.8, 0], [1.8, 0], [0, -1.8], [0, 1.8]].map(([x, z]) => (
        <RoundedBox
          key={`cable-${x}-${z}`}
          args={[0.03, 1.4, 0.03]}
          radius={0.01}
          smoothness={2}
          position={[x, 0.72, z]}
        >
          <meshStandardMaterial color={frameColor} roughness={0.88} />
        </RoundedBox>
      ))}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.36, 0.05, 18, 56]} />
        <meshStandardMaterial color={frameColor} roughness={0.38} metalness={0.54} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
        <torusGeometry args={[2.12, 0.04, 18, 56]} />
        <meshStandardMaterial
          color={lightColor}
          emissive={lightColor}
          emissiveIntensity={theme === "light" ? 0.12 : 0.46}
        />
      </mesh>
    </group>
  );
}

function TableStool({ theme, position, rotation = 0 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <RoundedBox
        args={[0.56, 0.1, 0.56]}
        radius={0.08}
        smoothness={4}
        position={[0, 0.4, 0]}
        castShadow
      >
        <meshStandardMaterial color={theme === "light" ? "#d8e1ea" : "#2a3445"} roughness={0.72} />
      </RoundedBox>
      <RoundedBox
        args={[0.08, 0.5, 0.08]}
        radius={0.02}
        smoothness={4}
        position={[0, 0.18, 0]}
        castShadow
      >
        <meshStandardMaterial color={theme === "light" ? "#c0b29d" : "#4a5260"} roughness={0.8} />
      </RoundedBox>
    </group>
  );
}

function CommandRoundTable({ theme, projectCount }) {
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

      <TableStool theme={theme} position={[-3.02, 0, 0.2]} rotation={Math.PI / 2} />
      <TableStool theme={theme} position={[3.02, 0, 0.2]} rotation={-Math.PI / 2} />
      <TableStool theme={theme} position={[0, 0, -3.04]} />
      <TableStool theme={theme} position={[0, 0, 3.02]} rotation={Math.PI} />

      <Html
        position={[0, 1.78, -0.08]}
        center
        distanceFactor={3}
        transform
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div
          style={{
            textAlign: "center",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
            whiteSpace: "nowrap",
          }}
        >
          <div
            style={{
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: 2,
              color: theme === "light" ? "#57534e" : "#e5e7eb",
            }}
          >
            AI 一人公司
          </div>
          <div
            style={{
              fontSize: 15,
              marginTop: 4,
              letterSpacing: 1.5,
              color: theme === "light" ? "#78716c" : "#94a3b8",
            }}
          >
            我 + {projectCount} 位 AI 同事 · 全员随叫随到
          </div>
        </div>
      </Html>
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
        <meshStandardMaterial
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={theme === "light" ? 0.03 : 0.08}
          roughness={0.74}
        />
      </RoundedBox>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 0.42, 14]} />
        <meshStandardMaterial color={frameColor} roughness={0.82} />
      </mesh>
      {[0, Math.PI / 2, Math.PI / 4, -Math.PI / 4].map((angle) => (
        <RoundedBox
          key={angle}
          args={[0.42, 0.03, 0.06]}
          radius={0.02}
          smoothness={4}
          position={[0, 0.04, 0]}
          rotation={[0, angle, 0]}
          castShadow
        >
          <meshStandardMaterial color={frameColor} roughness={0.82} />
        </RoundedBox>
      ))}
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((angle) => (
        <mesh
          key={`wheel-${angle}`}
          position={[Math.cos(angle) * 0.28, 0.02, Math.sin(angle) * 0.28]}
          rotation={[Math.PI / 2, 0, angle]}
        >
          <cylinderGeometry args={[0.04, 0.04, 0.05, 10]} />
          <meshStandardMaterial color={theme === "light" ? "#5b6575" : "#2f3744"} roughness={0.78} />
        </mesh>
      ))}
    </group>
  );
}

function ProjectAvatar({ project, position, highlighted = false }) {
  const avatarRef = React.useRef(null);
  useFrame((state) => {
    if (!avatarRef.current) return;
    const breathe = Math.sin(state.clock.elapsedTime * 1.6) * 0.012;
    avatarRef.current.position.y = breathe;
    if (highlighted) {
      avatarRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.9) * 0.12;
    } else {
      avatarRef.current.rotation.y *= 0.92;
    }
  });

  return (
    <group position={position} scale={AVATAR_SCALE}>
      {highlighted ? (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
            <ringGeometry args={[0.42, 0.62, 48]} />
            <meshBasicMaterial color={project.color} transparent opacity={0.42} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.031, 0]}>
            <ringGeometry args={[0.64, 0.78, 48]} />
            <meshBasicMaterial color={project.color} transparent opacity={0.18} />
          </mesh>
        </>
      ) : null}

      <group ref={avatarRef}>
        <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.36, 0.42, 0.08, 24]} />
          <meshStandardMaterial
            color={project.color}
            emissive={project.color}
            emissiveIntensity={highlighted ? 0.4 : 0.12}
            roughness={0.42}
            metalness={0.3}
          />
        </mesh>

        <mesh position={[0, 0.52, 0]} castShadow>
          <capsuleGeometry args={[0.22, 0.42, 12, 24]} />
          <meshPhysicalMaterial
            color={project.color}
            roughness={0.28}
            metalness={0.16}
            clearcoat={0.72}
            clearcoatRoughness={0.16}
          />
        </mesh>
        <mesh position={[0, 0.6, 0.2]} castShadow>
          <sphereGeometry args={[0.06, 14, 14]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive={project.color}
            emissiveIntensity={highlighted ? 0.62 : 0.22}
          />
        </mesh>

        <mesh position={[0, 0.86, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.09, 0.1, 14]} />
          <meshStandardMaterial color="#f4cdae" roughness={0.68} />
        </mesh>

        <mesh position={[0, 1.06, 0]} castShadow>
          <sphereGeometry args={[0.2, 24, 24]} />
          <meshStandardMaterial color="#f5cbad" roughness={0.58} />
        </mesh>
        <mesh position={[0, 1.12, -0.01]} rotation={[-0.12, 0, 0]} castShadow>
          <sphereGeometry args={[0.208, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2.1]} />
          <meshStandardMaterial color="#1f2a3a" roughness={0.82} />
        </mesh>
        <mesh position={[-0.074, 1.06, 0.178]}>
          <sphereGeometry args={[0.022, 10, 10]} />
          <meshStandardMaterial color="#1b2230" />
        </mesh>
        <mesh position={[0.074, 1.06, 0.178]}>
          <sphereGeometry args={[0.022, 10, 10]} />
          <meshStandardMaterial color="#1b2230" />
        </mesh>
        <mesh position={[-0.12, 1.02, 0.16]}>
          <sphereGeometry args={[0.026, 10, 10]} />
          <meshStandardMaterial color="#f2a58e" transparent opacity={0.5} />
        </mesh>
        <mesh position={[0.12, 1.02, 0.16]}>
          <sphereGeometry args={[0.026, 10, 10]} />
          <meshStandardMaterial color="#f2a58e" transparent opacity={0.5} />
        </mesh>

        <mesh position={[-0.28, 0.74, 0]} castShadow>
          <sphereGeometry args={[0.1, 14, 14]} />
          <meshStandardMaterial color={project.color} roughness={0.32} metalness={0.12} />
        </mesh>
        <mesh position={[0.28, 0.74, 0]} castShadow>
          <sphereGeometry args={[0.1, 14, 14]} />
          <meshStandardMaterial color={project.color} roughness={0.32} metalness={0.12} />
        </mesh>

        <mesh position={[-0.3, 0.55, 0.02]} rotation={[0.18, 0, 0.18]} castShadow>
          <capsuleGeometry args={[0.07, 0.28, 8, 14]} />
          <meshStandardMaterial color={project.color} roughness={0.36} metalness={0.14} />
        </mesh>
        <mesh position={[0.3, 0.55, 0.02]} rotation={[0.18, 0, -0.18]} castShadow>
          <capsuleGeometry args={[0.07, 0.28, 8, 14]} />
          <meshStandardMaterial color={project.color} roughness={0.36} metalness={0.14} />
        </mesh>

        <mesh position={[-0.32, 0.32, 0.12]} castShadow>
          <sphereGeometry args={[0.075, 14, 14]} />
          <meshStandardMaterial color="#f5cbad" roughness={0.66} />
        </mesh>
        <mesh position={[0.32, 0.32, 0.12]} castShadow>
          <sphereGeometry args={[0.075, 14, 14]} />
          <meshStandardMaterial color="#f5cbad" roughness={0.66} />
        </mesh>
      </group>
    </group>
  );
}

function DeskIdentityTag({ project, theme, highlighted = false }) {
  const plateColor = theme === "light" ? "#fffdf8" : "#111b2b";
  const secondaryColor = theme === "light" ? "#4b5563" : "#cbd5e1";
  const nameColor = theme === "light" ? "#0f172a" : "#f8fafc";
  const outlineColor = theme === "light" ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.96)";

  return (
    <group position={[0.72, 1.14, 0.34]} rotation={[-0.12, -0.44, 0]} scale={1.12}>
      <RoundedBox args={[0.9, 0.38, 0.045]} radius={0.06} smoothness={4}>
        <meshPhysicalMaterial
          color={plateColor}
          roughness={0.16}
          metalness={0.1}
          clearcoat={0.92}
          clearcoatRoughness={0.14}
          transmission={theme === "light" ? 0.08 : 0.16}
          transparent
          opacity={theme === "light" ? 0.96 : 0.92}
          emissive={highlighted ? project.color : "#000000"}
          emissiveIntensity={highlighted ? 0.14 : theme === "light" ? 0.015 : 0.04}
        />
      </RoundedBox>
      <RoundedBox
        args={[0.76, 0.034, 0.014]}
        radius={0.012}
        smoothness={2}
        position={[0, -0.12, 0.034]}
      >
        <meshStandardMaterial
          color={highlighted ? project.color : theme === "light" ? "#d6ccc2" : "#243244"}
          emissive={highlighted ? project.color : "#000000"}
          emissiveIntensity={highlighted ? 0.3 : theme === "light" ? 0 : 0.06}
        />
      </RoundedBox>
      <Text
        position={[-0.3, 0.06, 0.03]}
        fontSize={0.16}
        color={project.color}
        outlineWidth={0.008}
        outlineColor={outlineColor}
        anchorX="center"
        anchorY="middle"
      >
        {project.emoji || "✦"}
      </Text>
      <Text
        position={[-0.16, 0.07, 0.03]}
        fontSize={0.11}
        maxWidth={0.56}
        color={project.color}
        outlineWidth={0.012}
        outlineColor={outlineColor}
        anchorX="left"
        anchorY="middle"
      >
        {project.role}
      </Text>
      <Text
        position={[0, -0.06, 0.03]}
        fontSize={0.062}
        maxWidth={0.66}
        color={nameColor}
        outlineWidth={0.006}
        outlineColor={outlineColor}
        anchorX="center"
        anchorY="middle"
      >
        {shorten(project.name, 18)}
      </Text>
      <Text
        position={[0, -0.14, 0.03]}
        fontSize={0.05}
        maxWidth={0.66}
        color={secondaryColor}
        outlineWidth={0.004}
        outlineColor={outlineColor}
        anchorX="center"
        anchorY="middle"
      >
        {shorten(project.techStack, 26)}
      </Text>
    </group>
  );
}

function DeskFloorHalo({ color, active }) {
  const ringRef = React.useRef(null);
  useFrame((state) => {
    if (!ringRef.current) return;
    const t = state.clock.elapsedTime;
    const pulse = active ? 0.88 + Math.sin(t * 2.6) * 0.22 : 0.4;
    ringRef.current.material.opacity = pulse * (active ? 0.6 : 0.16);
    ringRef.current.scale.setScalar(active ? 1 + Math.sin(t * 2.6) * 0.04 : 1);
  });
  return (
    <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0.1]}>
      <ringGeometry args={[0.96, 1.28, 64]} />
      <meshBasicMaterial color={color} transparent opacity={0.2} />
    </mesh>
  );
}

function DeskPod({
  slot,
  project,
  theme,
  highlighted,
  hovered,
  setHovered,
  onOpen,
  status,
  launching,
  onLaunch,
}) {
  const scale = DESK_SCALE_BOOST;
  const active = highlighted || hovered;
  const screenColor = active ? "#0f3a21" : "#1f2937";
  useCursor(hovered);

  const isClawLink = project.id === "clawlink";
  const reachable = isClawLink ? true : Boolean(status?.reachable);
  const launchable = Boolean(project.launch?.command) && Boolean(status?.launchable ?? project.launch);
  const isLaunching = Boolean(launching || status?.launching);

  const triggerOpen = (event) => {
    event?.stopPropagation?.();
    if (typeof onOpen === "function") onOpen(project);
    else if (project.url && typeof window !== "undefined") {
      window.open(project.url, "_blank", "noopener");
    }
  };

  const triggerLaunch = (event) => {
    event?.stopPropagation?.();
    if (typeof onLaunch === "function") onLaunch(project);
  };

  let buttonMode = "idle";
  if (!project.url) buttonMode = "missing";
  else if (reachable) buttonMode = "online";
  else if (isLaunching) buttonMode = "launching";
  else if (launchable) buttonMode = "offline-launchable";
  else buttonMode = "offline";

  const buttonLabel = {
    missing: "· 待配置",
    launching: "启动中…",
    online: "打开 ↗",
    "offline-launchable": "启动 ▶",
    offline: "离线",
  }[buttonMode];

  const onButtonClick = (event) => {
    if (buttonMode === "offline-launchable") triggerLaunch(event);
    else if (buttonMode === "online") triggerOpen(event);
    else event?.stopPropagation?.();
  };

  const buttonDisabled = buttonMode === "missing" || buttonMode === "offline" || buttonMode === "launching";

  return (
    <group
      position={slot.position}
      rotation={[0, slot.rotation, 0]}
      scale={scale}
      onClick={triggerOpen}
    >
      <DeskFloorHalo color={project.color} active={active} />

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

      <RoundedBox
        args={[2.18, 0.06, 1.28]}
        radius={0.12}
        smoothness={4}
        position={[0, 0.03, 0.04]}
        receiveShadow
      >
        <meshStandardMaterial color={theme === "light" ? "#e9e5df" : "#1c2027"} roughness={0.98} />
      </RoundedBox>

      <RoundedBox
        args={[1.82, 0.12, 0.82]}
        radius={0.08}
        smoothness={4}
        position={[0, 0.84, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={theme === "light" ? "#d7b791" : "#694936"} roughness={0.62} />
      </RoundedBox>
      {[-0.7, 0.7]
        .flatMap((x) => [-0.24, 0.24].map((z) => [x, z]))
        .map(([x, z], index) => (
          <RoundedBox
            key={`desk-leg-${index}`}
            args={[0.1, 0.74, 0.1]}
            radius={0.03}
            smoothness={4}
            position={[x, 0.37, z]}
            castShadow
          >
            <meshStandardMaterial color={theme === "light" ? "#b89c81" : "#553c2c"} roughness={0.76} />
          </RoundedBox>
        ))}

      <RoundedBox
        args={[0.74, 0.46, 0.06]}
        radius={0.04}
        smoothness={4}
        position={[0, 1.3, -0.24]}
        castShadow
        renderOrder={1}
      >
        <meshStandardMaterial color={theme === "light" ? "#dbe1ea" : "#10151d"} />
      </RoundedBox>
      <RoundedBox
        args={[0.6, 0.32, 0.008]}
        radius={0.025}
        smoothness={4}
        position={[0, 1.3, -0.168]}
        renderOrder={2}
      >
        <meshPhysicalMaterial
          color={screenColor}
          emissive={active ? project.color : screenColor}
          emissiveIntensity={active ? 0.36 : 0.1}
          roughness={0.08}
          metalness={0.12}
          clearcoat={0.34}
          clearcoatRoughness={0.1}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-4}
        />
      </RoundedBox>
      {/* window chrome traffic-light dots */}
      {[
        { x: -0.25, color: "#ff5f57" },
        { x: -0.21, color: "#febc2e" },
        { x: -0.17, color: "#28c840" },
      ].map((dot) => (
        <mesh key={`dot-${dot.x}`} position={[dot.x, 1.44, -0.162]}>
          <circleGeometry args={[0.011, 16]} />
          <meshBasicMaterial color={dot.color} />
        </mesh>
      ))}
      {/* accent header bar */}
      <mesh position={[0.02, 1.44, -0.162]}>
        <planeGeometry args={[0.36, 0.018]} />
        <meshBasicMaterial color={project.color} transparent opacity={0.85} />
      </mesh>

      <Text
        position={[0, 1.4, -0.16]}
        fontSize={0.044}
        maxWidth={0.52}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.005}
        outlineColor="rgba(0,0,0,0.5)"
      >
        {project.role}
      </Text>

      {/* fake UI content rows */}
      {[0, 1, 2].map((row) => (
        <React.Fragment key={`content-row-${row}`}>
          <mesh position={[-0.16, 1.32 - row * 0.05, -0.162]}>
            <circleGeometry args={[0.012, 12]} />
            <meshBasicMaterial color={project.color} transparent opacity={active ? 0.85 : 0.55} />
          </mesh>
          <mesh position={[0.05, 1.32 - row * 0.05, -0.162]}>
            <planeGeometry args={[0.34 - row * 0.04, 0.014]} />
            <meshBasicMaterial
              color={active ? "#f8fafc" : "#cbd5e1"}
              transparent
              opacity={active ? 0.92 : 0.7}
            />
          </mesh>
        </React.Fragment>
      ))}

      <Text
        position={[0, 1.16, -0.16]}
        fontSize={0.028}
        maxWidth={0.52}
        color={active ? project.color : "#94a3b8"}
        anchorX="center"
        anchorY="middle"
      >
        {shorten(project.name, 20)}
      </Text>

      <RoundedBox
        args={[0.56, 0.02, 0.18]}
        radius={0.02}
        smoothness={4}
        position={[0, 0.93, 0.14]}
        castShadow
      >
        <meshStandardMaterial color="#3b4452" />
      </RoundedBox>
      <RoundedBox
        args={[0.44, 0.08, 0.44]}
        radius={0.08}
        smoothness={4}
        position={[0, 0.42, 0.62]}
        castShadow
      >
        <meshStandardMaterial color={theme === "light" ? "#d8d1c7" : "#353942"} />
      </RoundedBox>
      <RoundedBox
        args={[0.42, 0.38, 0.1]}
        radius={0.06}
        smoothness={4}
        position={[0, 0.62, 0.46]}
        castShadow
      >
        <meshStandardMaterial color={theme === "light" ? "#d8d1c7" : "#353942"} />
      </RoundedBox>

      {/* coffee mug — left of monitor */}
      <group position={[-0.68, 0.9, -0.1]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.07, 0.06, 0.12, 24]} />
          <meshPhysicalMaterial
            color={theme === "light" ? "#fafaf7" : "#f4efe6"}
            roughness={0.34}
            clearcoat={0.5}
            clearcoatRoughness={0.2}
          />
        </mesh>
        <mesh position={[0.088, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.036, 0.01, 10, 20, Math.PI]} />
          <meshStandardMaterial
            color={theme === "light" ? "#fafaf7" : "#f4efe6"}
            roughness={0.34}
          />
        </mesh>
        <mesh position={[0, 0.062, 0]}>
          <cylinderGeometry args={[0.058, 0.058, 0.002, 20]} />
          <meshStandardMaterial color="#4b2a1c" roughness={0.88} />
        </mesh>
        <mesh position={[0, 0.03, 0.072]}>
          <planeGeometry args={[0.05, 0.05]} />
          <meshBasicMaterial color={project.color} transparent opacity={0.88} />
        </mesh>
      </group>

      {/* notebook — right of monitor */}
      <group position={[0.64, 0.91, -0.1]} rotation={[0, -0.18, 0]}>
        <RoundedBox args={[0.26, 0.014, 0.34]} radius={0.018} smoothness={4} castShadow>
          <meshStandardMaterial color={project.color} roughness={0.7} />
        </RoundedBox>
        <mesh position={[0, 0.008, 0]}>
          <planeGeometry args={[0.22, 0.3]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.82} />
        </mesh>
        {[0, 1, 2, 3].map((line) => (
          <mesh key={`nb-line-${line}`} position={[0, 0.009, -0.08 + line * 0.05]}>
            <planeGeometry args={[0.18 - line * 0.02, 0.006]} />
            <meshBasicMaterial color="#9ca3af" transparent opacity={0.78} />
          </mesh>
        ))}
      </group>

      {/* pen */}
      <mesh position={[0.62, 0.92, 0.06]} rotation={[0, 0.6, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.01, 0.01, 0.22, 12]} />
        <meshStandardMaterial
          color={project.color}
          emissive={project.color}
          emissiveIntensity={0.12}
          metalness={0.3}
          roughness={0.36}
        />
      </mesh>

      {/* sticky note */}
      <mesh position={[-0.5, 0.904, 0.14]} rotation={[-Math.PI / 2, 0, 0.18]}>
        <planeGeometry args={[0.14, 0.14]} />
        <meshStandardMaterial
          color={theme === "light" ? "#fde68a" : "#fcd34d"}
          emissive={theme === "light" ? "#fde68a" : "#fcd34d"}
          emissiveIntensity={theme === "light" ? 0.04 : 0.18}
          roughness={0.82}
        />
      </mesh>

      <OfficeChair theme={theme} position={[0, 0, 0.74]} rotation={Math.PI} accentColor={project.color} />

      {[-0.2, 0, 0.2].map((offset, index) => (
        <RoundedBox
          key={`status-bar-${index}`}
          args={[0.12 + index * 0.08, 0.018, 0.018]}
          radius={0.008}
          smoothness={2}
          position={[-0.18 + index * 0.18, 1.02, -0.18]}
        >
          <meshStandardMaterial
            color={active ? project.color : theme === "light" ? "#cbd5e1" : "#4b5563"}
            emissive={active ? project.color : "#000000"}
            emissiveIntensity={active ? 0.62 : 0}
          />
        </RoundedBox>
      ))}

      <DeskIdentityTag project={project} theme={theme} highlighted={active} />

      {active ? (
        <Html position={[0, 2.34, 0.12]} center distanceFactor={7.6} style={{ pointerEvents: "auto" }}>
          <button
            type="button"
            className="gallery-desk-pin"
            onClick={onButtonClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            disabled={buttonDisabled}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              background: theme === "light" ? "rgba(255,255,255,0.96)" : "rgba(15,20,30,0.94)",
              color: theme === "light" ? "#0f172a" : "#f8fafc",
              border: `1.5px solid ${project.color}`,
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              boxShadow: `0 8px 22px ${project.color}55`,
              cursor: buttonDisabled ? "not-allowed" : "pointer",
              opacity: buttonMode === "missing" || buttonMode === "offline" ? 0.72 : 1,
              fontFamily:
                "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
              userSelect: "none",
              whiteSpace: "nowrap",
            }}
          >
            <span>{project.emoji || "🤖"}</span>
            <span>{project.role}</span>
            <span style={{ color: project.color }}>{buttonLabel}</span>
          </button>
        </Html>
      ) : null}

      <ProjectAvatar project={project} position={[0, 0, 0.72]} highlighted={active} />
    </group>
  );
}

function DeskPodContainer({ slot, project, theme, highlighted, onOpen, onHover, status, launching, onLaunch }) {
  const [hovered, setHoveredLocal] = React.useState(false);

  const setHovered = React.useCallback(
    (next) => {
      setHoveredLocal(next);
      if (typeof onHover === "function") onHover(next ? project.id : null);
    },
    [onHover, project.id],
  );

  return (
    <DeskPod
      slot={slot}
      project={project}
      theme={theme}
      highlighted={highlighted}
      hovered={hovered}
      setHovered={setHovered}
      onOpen={onOpen}
      status={status}
      launching={launching}
      onLaunch={onLaunch}
    />
  );
}

function PatrolRoute({ theme, route }) {
  const points = React.useMemo(
    () => route.points.flatMap((point, pointIndex) => {
      const nextPoint = route.points[(pointIndex + 1) % route.points.length];
      const dx = nextPoint[0] - point[0];
      const dz = nextPoint[2] - point[2];
      const distance = Math.hypot(dx, dz);
      const sampleCount = Math.max(3, Math.floor(distance / 1.8));

      return Array.from({ length: sampleCount }, (_, sampleIndex) => {
        const t = sampleIndex / sampleCount;
        return [
          point[0] + dx * t,
          0.022,
          point[2] + dz * t,
        ];
      });
    }),
    [route.points],
  );

  const markerColor = route.color || (theme === "light" ? "#93c5fd" : "#38bdf8");

  return (
    <group>
      {points.map((point, index) => (
        <mesh
          key={`patrol-marker-${index}`}
          position={point}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <ringGeometry args={[0.08, 0.12, 18]} />
          <meshBasicMaterial color={markerColor} transparent opacity={index % 3 === 0 ? 0.24 : 0.12} />
        </mesh>
      ))}
    </group>
  );
}

function PatrolRobot({ theme, route, inspectTarget, active = false, routeOffset = 0 }) {
  const robotRef = React.useRef(null);
  const headRef = React.useRef(null);
  const beaconRef = React.useRef(null);
  const beaconLightRef = React.useRef(null);
  const alertLightLeftRef = React.useRef(null);
  const alertLightRightRef = React.useRef(null);
  const wheelRefs = React.useRef([]);
  const progressRef = React.useRef({ segmentIndex: 0, distanceOnSegment: 0 });
  const initialOffsetAppliedRef = React.useRef(false);
  const pathData = React.useMemo(() => {
    const segments = route.points.map((point, index) => {
      const nextPoint = route.points[(index + 1) % route.points.length];
      const dx = nextPoint[0] - point[0];
      const dz = nextPoint[2] - point[2];
      const length = Math.hypot(dx, dz) || 1;

      return {
        start: point,
        end: nextPoint,
        dx,
        dz,
        length,
      };
    });

    const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
    return { segments, totalLength };
  }, [route.points]);

  const motionStateRef = React.useRef({
    x: route.points[0][0],
    z: route.points[0][2],
    heading: 0,
    bobPhase: Math.random() * Math.PI * 2,
  });

  React.useEffect(() => {
    motionStateRef.current = {
      x: route.points[0][0],
      z: route.points[0][2],
      heading: 0,
      bobPhase: motionStateRef.current.bobPhase,
    };
  }, []);

  React.useEffect(() => {
    if (!pathData.segments.length) return;

    const motionState = motionStateRef.current;
    const nearestPointIndex = route.points.reduce((bestIndex, point, pointIndex) => (
      distance2D([motionState.x, 0, motionState.z], point) < distance2D([motionState.x, 0, motionState.z], route.points[bestIndex])
        ? pointIndex
        : bestIndex
    ), 0);

    progressRef.current = {
      segmentIndex: nearestPointIndex % pathData.segments.length,
      distanceOnSegment: 0,
    };

    if (!initialOffsetAppliedRef.current && routeOffset > 0) {
      let remainingOffset = routeOffset;
      while (remainingOffset > 0) {
        const currentSegment = pathData.segments[progressRef.current.segmentIndex];
        if (!currentSegment) break;
        const usableStep = Math.min(remainingOffset, currentSegment.length);
        progressRef.current.distanceOnSegment += usableStep;
        remainingOffset -= usableStep;
        if (progressRef.current.distanceOnSegment >= currentSegment.length - 0.0001) {
          progressRef.current.segmentIndex = (progressRef.current.segmentIndex + 1) % pathData.segments.length;
          progressRef.current.distanceOnSegment = 0;
        }
      }
      initialOffsetAppliedRef.current = true;
    }
  }, [pathData, route.points, routeOffset]);

  useFrame((state, delta) => {
    if (!robotRef.current) return;

    const motionState = motionStateRef.current;
    const patrolTravelSpeed = 1.75;
    if (!pathData.segments.length) return;

    let remainingTravel = delta * patrolTravelSpeed;
    while (remainingTravel > 0) {
      const currentSegment = pathData.segments[progressRef.current.segmentIndex];
      if (!currentSegment) break;
      const remainingOnSegment = Math.max(0.0001, currentSegment.length - progressRef.current.distanceOnSegment);
      const step = Math.min(remainingTravel, remainingOnSegment);
      progressRef.current.distanceOnSegment += step;
      remainingTravel -= step;

      if (progressRef.current.distanceOnSegment >= currentSegment.length - 0.0001) {
        progressRef.current.segmentIndex = (progressRef.current.segmentIndex + 1) % pathData.segments.length;
        progressRef.current.distanceOnSegment = 0;
      }
    }

    const routeSegment = pathData.segments[progressRef.current.segmentIndex] || pathData.segments[0];
    const routeT = routeSegment.length > 0 ? progressRef.current.distanceOnSegment / routeSegment.length : 0;
    const patrolTarget = [
      routeSegment.start[0] + routeSegment.dx * routeT,
      0,
      routeSegment.start[2] + routeSegment.dz * routeT,
    ];
    const inspecting = Boolean(inspectTarget?.position) && distance2D(motionState, inspectTarget.position) < 1.3;
    const targetPosition = inspectTarget?.position || patrolTarget;
    const moveDx = targetPosition[0] - motionState.x;
    const moveDz = targetPosition[2] - motionState.z;
    const moveDistance = Math.hypot(moveDx, moveDz);
    const targetLookAt = inspecting
      ? inspectTarget.lookAt
      : [
          targetPosition[0],
          0.96,
          targetPosition[2] + (moveDistance < 0.05 ? 0.1 : 0),
        ];
    const moveStep = Math.min(moveDistance, delta * (inspecting ? 1.4 : 2.15));

    if (moveDistance > 0.0001) {
      motionState.x += (moveDx / moveDistance) * moveStep;
      motionState.z += (moveDz / moveDistance) * moveStep;
    }

    const lookDx = targetLookAt[0] - motionState.x;
    const lookDz = targetLookAt[2] - motionState.z;
    const targetHeading = Math.atan2(lookDx, lookDz);
    const shortestTurn = Math.atan2(
      Math.sin(targetHeading - motionState.heading),
      Math.cos(targetHeading - motionState.heading),
    );
    motionState.heading += shortestTurn * Math.min(1, delta * (inspectTarget ? 4.6 : 3.8));

    const bob = Math.sin(state.clock.elapsedTime * (inspecting ? 3.2 : 4.2) + motionState.bobPhase) * 0.03;

    robotRef.current.position.set(motionState.x, 0.04 + bob, motionState.z);
    robotRef.current.rotation.y = motionState.heading;

    if (headRef.current) {
      const inspectTurn = inspecting
        ? Math.atan2(
            Math.sin(targetHeading - motionState.heading),
            Math.cos(targetHeading - motionState.heading),
          )
        : Math.sin(state.clock.elapsedTime * 1.6 + routeOffset * 0.1) * 0.18;
      headRef.current.rotation.y += (inspectTurn - headRef.current.rotation.y) * Math.min(1, delta * 4.8);
    }

    if (beaconRef.current) {
      const pulse = Math.sin(state.clock.elapsedTime * (theme === "dark" ? 7.2 : 5.6) + routeOffset * 0.1) * 0.5 + 0.5;
      beaconRef.current.material.opacity = 0.1 + pulse * (theme === "dark" ? 0.18 : 0.12);
      beaconRef.current.scale.setScalar(1 + pulse * 0.08);
    }

    if (beaconLightRef.current) {
      beaconLightRef.current.intensity = theme === "dark" ? 0.85 : 0.42;
    }

    if (alertLightLeftRef.current && alertLightRightRef.current) {
      const blink = Math.sin(state.clock.elapsedTime * 10 + routeOffset * 0.2) * 0.5 + 0.5;
      alertLightLeftRef.current.intensity = theme === "dark" ? 0.34 + blink * 0.64 : 0;
      alertLightRightRef.current.intensity = theme === "dark" ? 0.34 + (1 - blink) * 0.64 : 0;
    }

    wheelRefs.current.forEach((wheel) => {
      if (!wheel) return;
      wheel.rotation.x -= delta * (moveStep > 0.0001 ? 11.6 * (moveStep / Math.max(delta, 0.001)) * 0.1 : 0);
    });
  });

  const shellColor = theme === "light" ? "#f7fafc" : "#d8e1ea";
  const bodyColor = theme === "light" ? "#c8d7e8" : "#243447";
  const trimColor = route.color || (theme === "light" ? "#94a3b8" : "#60a5fa");
  const scanColor = active ? "#f97316" : route.color || (theme === "light" ? "#38bdf8" : "#22d3ee");
  const wheelColor = theme === "light" ? "#475569" : "#111827";
  const alertColor = theme === "dark" ? "#fb7185" : scanColor;
  return (
    <group ref={robotRef}>
      <mesh ref={beaconRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.3, 0.42, 32]} />
        <meshBasicMaterial color={scanColor} transparent opacity={0.18} />
      </mesh>
      <pointLight ref={beaconLightRef} position={[0, 1.38, 0.06]} distance={3.2} color={scanColor} intensity={0.42} />
      <pointLight ref={alertLightLeftRef} position={[-0.2, 1.18, 0.18]} distance={2.6} color={alertColor} intensity={0} />
      <pointLight ref={alertLightRightRef} position={[0.2, 1.18, 0.18]} distance={2.6} color={alertColor} intensity={0} />

      <RoundedBox
        args={[0.92, 0.2, 1.02]}
        radius={0.08}
        smoothness={4}
        position={[0, 0.18, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={bodyColor} roughness={0.42} metalness={0.24} />
      </RoundedBox>

      <RoundedBox
        args={[0.72, 0.5, 0.86]}
        radius={0.12}
        smoothness={4}
        position={[0, 0.52, 0]}
        castShadow
        receiveShadow
      >
        <meshPhysicalMaterial
          color={shellColor}
          roughness={0.18}
          metalness={0.08}
          clearcoat={0.62}
          clearcoatRoughness={0.14}
        />
      </RoundedBox>

      <group ref={headRef} position={[0, 0.98, 0.12]}>
        <RoundedBox args={[0.5, 0.3, 0.38]} radius={0.1} smoothness={4} castShadow>
          <meshPhysicalMaterial
            color={shellColor}
            roughness={0.18}
            metalness={0.08}
            clearcoat={0.62}
            clearcoatRoughness={0.14}
          />
        </RoundedBox>
        <mesh position={[-0.1, 0.02, 0.2]}>
          <sphereGeometry args={[0.04, 16, 16]} />
          <meshStandardMaterial color="#ffffff" emissive={scanColor} emissiveIntensity={1.2} />
        </mesh>
        <mesh position={[0.1, 0.02, 0.2]}>
          <sphereGeometry args={[0.04, 16, 16]} />
          <meshStandardMaterial color="#ffffff" emissive={scanColor} emissiveIntensity={1.2} />
        </mesh>
        <mesh position={[0, -0.07, 0.205]}>
          <planeGeometry args={[0.24, 0.03]} />
          <meshBasicMaterial color={scanColor} transparent opacity={0.72} />
        </mesh>
      </group>

      <mesh position={[0, 1.22, 0.06]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.26, 12]} />
        <meshStandardMaterial color={trimColor} roughness={0.38} metalness={0.42} />
      </mesh>
      <mesh position={[0, 1.38, 0.06]} castShadow>
        <sphereGeometry args={[0.06, 14, 14]} />
        <meshStandardMaterial color={scanColor} emissive={scanColor} emissiveIntensity={0.88} />
      </mesh>

      {[
        [-0.42, 0.14, 0.26],
        [0.42, 0.14, 0.26],
        [-0.42, 0.14, -0.26],
        [0.42, 0.14, -0.26],
      ].map((position, index) => (
        <mesh
          key={`patrol-wheel-${index}`}
          ref={(node) => {
            wheelRefs.current[index] = node;
          }}
          position={position}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
        >
          <cylinderGeometry args={[0.12, 0.12, 0.12, 18]} />
          <meshStandardMaterial color={wheelColor} roughness={0.78} />
        </mesh>
      ))}

      <mesh position={[0, 0.72, -0.36]} castShadow>
        <boxGeometry args={[0.3, 0.12, 0.1]} />
        <meshStandardMaterial color={trimColor} roughness={0.34} metalness={0.32} />
      </mesh>
    </group>
  );
}

function CameraRig({ focusTarget }) {
  const controlsRef = React.useRef(null);
  const { camera } = useThree();
  const initializedRef = React.useRef(false);
  const animStateRef = React.useRef({ id: null, animating: false });
  const desiredPosRef = React.useRef(new Vector3());
  const desiredLookRef = React.useRef(new Vector3());

  React.useEffect(() => {
    if (initializedRef.current) return;
    camera.position.set(...CAMERA_PRESET.position);
    camera.fov = CAMERA_PRESET.fov;
    camera.updateProjectionMatrix();
    if (controlsRef.current) {
      controlsRef.current.target.set(...CAMERA_PRESET.target);
      controlsRef.current.update();
    }
    initializedRef.current = true;
  }, [camera]);

  React.useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return undefined;
    const stop = () => {
      animStateRef.current.animating = false;
    };
    controls.addEventListener("start", stop);
    return () => controls.removeEventListener("start", stop);
  }, []);

  const hadFocusRef = React.useRef(false);
  React.useEffect(() => {
    if (!focusTarget) {
      if (hadFocusRef.current) {
        desiredPosRef.current.set(...CAMERA_PRESET.position);
        desiredLookRef.current.set(...CAMERA_PRESET.target);
        animStateRef.current = { id: "__overview__", animating: true };
        hadFocusRef.current = false;
      } else {
        animStateRef.current = { id: null, animating: false };
      }
      return;
    }
    desiredPosRef.current.set(...focusTarget.cameraPosition);
    desiredLookRef.current.set(...focusTarget.lookAt);
    animStateRef.current = { id: focusTarget.id, animating: true };
    hadFocusRef.current = true;
  }, [focusTarget]);

  useFrame((_, delta) => {
    const state = animStateRef.current;
    if (!state.animating || !controlsRef.current) return;
    const controls = controlsRef.current;
    const t = Math.min(1, delta * 2.6);
    camera.position.lerp(desiredPosRef.current, t);
    controls.target.lerp(desiredLookRef.current, t);
    controls.update();
    if (
      camera.position.distanceTo(desiredPosRef.current) < 0.06 &&
      controls.target.distanceTo(desiredLookRef.current) < 0.03
    ) {
      state.animating = false;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.82}
      panSpeed={0.6}
      minDistance={4}
      maxDistance={48}
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI / 2.02}
    />
  );
}

function GalleryScene({ projects, theme, activeId, focusId, focusToken = 0, onOpen, onHover, statusMap, launchingId, onLaunch }) {
  const slots = React.useMemo(
    () =>
      projects.slice(0, DESK_SLOTS.length).map((project, index) => ({
        project,
        slotIndex: index,
        ...DESK_SLOTS[index],
      })),
    [projects],
  );
  const inspectTarget = React.useMemo(
    () => buildDeskInspectPoint(slots.find((slot) => slot.project.id === activeId) || null),
    [activeId, slots],
  );
  const focusTarget = React.useMemo(
    () => {
      const base = buildDeskFocusPoint(slots.find((slot) => slot.project.id === focusId) || null);
      return base ? { ...base, token: focusToken } : null;
    },
    [focusId, focusToken, slots],
  );
  const activeRouteId = inspectTarget?.routeId || "";

  return (
    <>
      <color attach="background" args={[theme === "light" ? "#eef2f4" : "#08111b"]} />
      <fog attach="fog" args={[theme === "light" ? "#eef2f4" : "#08111b", 46, 110]} />

      <ambientLight intensity={theme === "light" ? 1.12 : 1.34} />
      <hemisphereLight
        intensity={theme === "light" ? 0.6 : 0.98}
        color={theme === "light" ? "#fffaf5" : "#9ed6ff"}
        groundColor={theme === "light" ? "#d0b79a" : "#604334"}
      />
      <directionalLight
        position={[11, 15, 9]}
        intensity={theme === "light" ? 1.64 : 2.06}
        castShadow
        shadow-mapSize-width={1536}
        shadow-mapSize-height={1536}
      />
      <pointLight
        position={[0, 6.2, 0.8]}
        intensity={theme === "light" ? 0.96 : 1.32}
        color={theme === "light" ? "#fff7ed" : "#ffd8b1"}
      />
      <pointLight
        position={[-12.2, 4.8, -2.2]}
        intensity={theme === "light" ? 0.42 : 0.82}
        color={theme === "light" ? "#ffffff" : "#7dd3fc"}
      />
      <pointLight
        position={[12.2, 4.8, -2.2]}
        intensity={theme === "light" ? 0.42 : 0.82}
        color={theme === "light" ? "#ffffff" : "#a5b4fc"}
      />

      <Environment preset={theme === "light" ? "city" : "night"} background={false} />
      {theme === "dark" ? (
        <Stars radius={120} depth={60} count={1600} factor={3.8} saturation={0} fade speed={0.6} />
      ) : null}

      <SkyDome theme={theme} />
      <SidewalkRing theme={theme} />
      <CityRing theme={theme} />
      <OfficeFloor theme={theme} />
      <TerraceReflectingPool theme={theme} />
      <ExteriorGarden theme={theme} />
      <EntrancePlaza theme={theme} />
      <OfficeShell theme={theme} />
      <CeilingLightRig theme={theme} />
      <CommandCanopy theme={theme} />
      <CommandRoundTable theme={theme} projectCount={projects.length} />
      {PATROL_ROUTES.map((route) => (
        <PatrolRoute key={`route-${route.id}`} theme={theme} route={route} />
      ))}
      {PATROL_ROUTES.map((route, index) => (
        <PatrolRobot
          key={`robot-${route.id}`}
          theme={theme}
          route={route}
          inspectTarget={route.id === activeRouteId ? inspectTarget : null}
          active={route.id === activeRouteId}
          routeOffset={index * 8.5}
        />
      ))}

      {slots.map((slot) => (
        <DeskPodContainer
          key={slot.project.id}
          slot={slot}
          project={slot.project}
          theme={theme}
          highlighted={activeId === slot.project.id}
          onOpen={onOpen}
          onHover={onHover}
          status={statusMap?.[slot.project.id]}
          launching={launchingId === slot.project.id}
          onLaunch={onLaunch}
        />
      ))}

      <CameraRig focusTarget={focusTarget} />
    </>
  );
}

function ProjectGallery3D({
  projects = [],
  theme = "dark",
  activeId,
  focusId,
  focusToken = 0,
  onOpen,
  onHover,
  statusMap = {},
  launchingId = null,
  onLaunch,
}) {
  return (
    <div className="clawlink-office-canvas">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        gl={{
          toneMappingExposure: theme === "light" ? 1.04 : 1.18,
          powerPreference: "high-performance",
          antialias: true,
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
        }}
        camera={{ position: CAMERA_PRESET.position, fov: CAMERA_PRESET.fov }}
      >
        <GalleryScene
          projects={projects}
          theme={theme}
          activeId={activeId}
          focusId={focusId}
          focusToken={focusToken}
          onOpen={onOpen}
          onHover={onHover}
          statusMap={statusMap}
          launchingId={launchingId}
          onLaunch={onLaunch}
        />
      </Canvas>
    </div>
  );
}

export default React.memo(ProjectGallery3D);
