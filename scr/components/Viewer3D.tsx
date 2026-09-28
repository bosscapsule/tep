import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Grid, Center, ContactShadows, useGLTF, Html } from '@react-three/drei';
import React, { useRef, Suspense, useState, useMemo, useEffect, Component } from 'react';
import * as THREE from 'three';
import { motion } from 'motion/react';
import { Maximize2, MousePointer2, RotateCw, Trash2, Eye, EyeOff, RefreshCcw, Box, Sun, Moon, AlertOctagon, Paintbrush, Pin, X, Check, Edit2, Globe, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { mediaStore } from '../lib/mediaStore';

// Maps a given model URL or base64 data string to a small, safe, unique storage key.
// This prevents QuotaExceededError when using massive data URIs or long names as JSON keys inside localStorage.
const getModelStorageKey = (modelId: string): string => {
  if (!modelId) return '';
  if (['skull', 'jaw', 'brain'].includes(modelId)) return modelId;
  
  try {
    const savedMedia = localStorage.getItem('tester_pro_media');
    if (savedMedia) {
      const parsed = JSON.parse(savedMedia) as { id: string; url: string }[];
      const item = parsed.find(m => m.url === modelId || m.id === modelId);
      if (item) return item.id;
    }
  } catch (e) {
    // ignore
  }

  if (modelId.startsWith('data:')) {
    let hash = 0;
    for (let i = 0; i < modelId.length; i++) {
      const char = modelId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `b64_${Math.abs(hash)}_${modelId.length}`;
  }
  
  return modelId;
};

// React Error Boundary to catch loading and visualizer issues gracefully inside React Three Fiber
class ErrorBoundary extends Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("ErrorBoundary caught 3D loader error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

const DEFAULT_MODEL_LABELS: Record<string, Record<string, {nameRu: string, nameUz: string, color: string}>> = {
  skull: {
    cranium: { nameRu: 'Теменная и лобная кость (Cranium)', nameUz: 'Tepalik va peshona suyagi (Cranium)', color: '#10b981' },
    mandible: { nameRu: 'Нижняя челюсть (Mandibula)', nameUz: 'Pastki jag\' (Mandibula)', color: '#3b82f6' }
  },
  jaw: {
    mandible: { nameRu: 'Нижняя челюсть со стоп-зубами (Mandibula)', nameUz: 'Tishli pastki jag\' (Mandibula)', color: '#f59e0b' }
  },
  brain: {
    left: { nameRu: 'Левое полушарие (Hemispherium sinistrum)', nameUz: 'Chap yarim shar (Hemispherium sinistrum)', color: '#a855f7' },
    right: { nameRu: 'Правое полушарие (Hemispherium dextrum)', nameUz: 'O\'ng yarim shar (Hemispherium dextrum)', color: '#ec4899' },
    cerebellum: { nameRu: 'Мозжечок (Cerebellum)', nameUz: 'Miyacha (Cerebellum)', color: '#10b981' }
  }
};

function FloatingTag({ text, color }: { text: string; color: string }) {
  return null;
}

function CustomAnnotationMarker({ 
  id, 
  position, 
  name,
  nameRu, 
  nameUz, 
  nameEn = '',
  nameLa = '',
  color, 
  language, 
  onDelete,
  onDragStart,
  isDragging,
  labelOffset,
  onLabelDragStart,
  onLabelDragMove,
  onLabelDragEnd,
  isDraggingLabel
}: { 
  id: string; 
  position: [number, number, number]; 
  name?: string;
  nameRu: string; 
  nameUz: string; 
  nameEn?: string;
  nameLa?: string;
  color: string; 
  language: 'uz' | 'ru' | 'en';
  onDelete: () => void;
  onDragStart: () => void;
  isDragging: boolean;
  labelOffset?: [number, number, number];
  onLabelDragStart: () => void;
  onLabelDragMove: (newOffset: [number, number, number]) => void;
  onLabelDragEnd: () => void;
  isDraggingLabel: boolean;
}) {
  const { camera } = useThree();
  
  const labelText = useMemo(() => {
    if (name) return name;
    if (language === 'en') return nameEn || nameRu || nameUz;
    if (language === 'ru') return nameRu || nameUz || nameEn;
    return nameUz || nameRu || nameEn;
  }, [name, language, nameRu, nameUz, nameEn]);

  const [hovered, setHovered] = useState(false);
  const [labelHovered, setLabelHovered] = useState(false);

  // Calculate default radial direction vector
  const { dir } = useMemo(() => {
    const d = new THREE.Vector3(...position);
    if (d.lengthSq() < 0.0001) {
      return { dir: new THREE.Vector3(0, 1, 0) };
    }
    return { dir: d.normalize() };
  }, [position]);

  // Determine current active offset for the label
  const currentOffset = useMemo(() => {
    if (labelOffset) return labelOffset;
    return [dir.x * 0.45, dir.y * 0.45, dir.z * 0.45] as [number, number, number];
  }, [labelOffset, dir]);

  // Generate dynamic 3D lines from the pinpoint to the label offset
  const linePoints = useMemo(() => [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(...currentOffset)
  ], [currentOffset]);

  const lineGeometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(linePoints);
  }, [linePoints]);

  const lineMaterial = useMemo(() => {
    return new THREE.LineBasicMaterial({
      color: new THREE.Color(color),
      opacity: isDragging || isDraggingLabel ? 0.95 : 0.6,
      transparent: true,
      linewidth: 2
    });
  }, [color, isDragging, isDraggingLabel]);

  const lineMesh = useMemo(() => {
    return new THREE.Line(lineGeometry, lineMaterial);
  }, [lineGeometry, lineMaterial]);

  const sphereScale = isDragging ? 1.6 : (hovered ? 1.3 : 1.0);

  // Drag handlers for the label HTML element
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startOffset: [number, number, number] } | null>(null);

  const handleLabelPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startOffset: [...currentOffset]
    };
    onLabelDragStart();
  };

  const handleLabelPointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    e.stopPropagation();
    const dx = e.clientX - dragStartRef.current.mouseX;
    const dy = e.clientY - dragStartRef.current.mouseY;

    // Retrieve camera Basis vectors to translate screen-space 2D drag to 3D world space
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const tempDir = new THREE.Vector3();
    camera.matrixWorld.extractBasis(right, up, tempDir);

    // Dynamic drag factor scaled by distance to camera
    const pinWorldPos = new THREE.Vector3(...position);
    const dist = camera.position.distanceTo(pinWorldPos) || 5;
    const dragScale = 0.0018 * dist;

    const deltaWorld = right.clone().multiplyScalar(dx * dragScale)
      .add(up.clone().multiplyScalar(-dy * dragScale));

    const newOffset: [number, number, number] = [
      dragStartRef.current.startOffset[0] + deltaWorld.x,
      dragStartRef.current.startOffset[1] + deltaWorld.y,
      dragStartRef.current.startOffset[2] + deltaWorld.z,
    ];

    onLabelDragMove(newOffset);
  };

  const handleLabelPointerUp = (e: React.PointerEvent) => {
    if (dragStartRef.current) {
      e.stopPropagation();
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      dragStartRef.current = null;
      onLabelDragEnd();
    }
  };

  return (
    <group position={position}>
      {/* Tiny 3D pinpoint sphere at the exact coordinates on the surface - Draggable! */}
      <mesh
        scale={[sphereScale, sphereScale, sphereScale]}
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.target as any).setPointerCapture(e.pointerId);
          onDragStart();
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          (e.target as any).releasePointerCapture(e.pointerId);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
        }}
      >
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshBasicMaterial 
          color={color} 
          toneMapped={false}
        />
      </mesh>

      {/* Dynamic, clean, and elegant pointer line in 3D space */}
      <primitive object={lineMesh} />
      
      {/* HTML tag positioned dynamically at the top of the line */}
      <Html 
        distanceFactor={6} 
        position={currentOffset} 
        center 
        style={{ pointerEvents: isDragging ? 'none' : 'auto' }}
      >
        <div className="flex flex-col items-center select-none" style={{ width: 'max-content' }}>
          <div 
            onPointerDown={handleLabelPointerDown}
            onPointerMove={handleLabelPointerMove}
            onPointerUp={handleLabelPointerUp}
            onPointerOver={() => setLabelHovered(true)}
            onPointerOut={() => setLabelHovered(false)}
            className={cn(
              "bg-zinc-950/95 backdrop-blur-md px-3 py-1.5 rounded-xl border flex items-center gap-2 shadow-2xl transition-all duration-300 select-none",
              isDraggingLabel ? "scale-105 opacity-80 border-indigo-400 cursor-grabbing" : "hover:scale-105 cursor-grab",
              labelHovered ? "border-zinc-400" : ""
            )}
            style={{ 
              borderColor: isDraggingLabel ? '#6366f1' : `${color}70`,
              boxShadow: isDraggingLabel 
                ? `0 8px 32px 0 rgba(99, 102, 241, 0.4), 0 0 16px 0 ${color}40`
                : `0 8px 32px 0 rgba(0, 0, 0, 0.4), 0 0 12px 0 ${color}20`
            }}
          >
            {/* Blinking light dot */}
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: color }} />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: color }} />
            </span>

            <div className="flex flex-col items-start whitespace-nowrap leading-tight">
              <span className="text-[10px] font-bold text-zinc-100">
                {labelText}
              </span>
              {nameLa && (
                <span className="text-[8px] font-black text-indigo-400 italic">
                  {nameLa}
                </span>
              )}
            </div>

            {!isDragging && !isDraggingLabel && (
              <button 
                onPointerDown={(e) => e.stopPropagation()} // Prevent initiating drag when clicking delete
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="ml-2 p-0.5 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-all cursor-pointer"
                title={language === 'en' ? 'Delete pin' : language === 'ru' ? 'Удалить отметку' : 'Belgini o‘chirish'}
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
        </div>
      </Html>
    </group>
  );
}

// External GLB Loader
function ExternalModel({ 
  url, 
  highlightPart, 
  highlightLabel, 
  highlightLabelColor, 
  onPartClick, 
  onPartDoubleClick,
  customColors,
  lightingPreset,
  isolateMode = false
}: ModelProps & { url: string }) {
  const { scene } = useGLTF(url);
  const groupRef = useRef<THREE.Group>(null);

  // Traverse the loaded GLB/GLTF scene and set up responsive materials
  const currentScene = useMemo(() => {
    // Clone scene to avoid shared instance mutating if multiple instances
    const cloned = scene.clone();
    
    cloned.traverse((child: any) => {
      if (child.isMesh) {
        const mesh = child as THREE.Mesh;
        // Assign cloned default materials so we can style separately
        const originalMaterial = mesh.material;
        mesh.material = Array.isArray(originalMaterial)
          ? originalMaterial.map(m => m?.clone?.() || new THREE.MeshStandardMaterial())
          : (originalMaterial ? originalMaterial.clone() : new THREE.MeshStandardMaterial());
        
        // Save original color and physical material specifications
        if (!mesh.userData.originalColor) {
          const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          if (mat && 'color' in mat) {
            mesh.userData.originalColor = (mat as any).color.getHexString();
          } else {
            mesh.userData.originalColor = "cccccc";
          }
        }
      }
    });
    return cloned;
  }, [scene]);

  // Dynamically update colors and highlights of child meshes
  useEffect(() => {
    const isXRay = lightingPreset === 'xray';
    const isCinematic = lightingPreset === 'cinematic';

    currentScene.traverse((child: any) => {
      if (child.isMesh) {
        const mesh = child as THREE.Mesh;
        const meshName = mesh.name || mesh.id.toString();
        const isHighlighted = highlightPart === meshName;
        const isGhosted = isolateMode && highlightPart && highlightPart !== meshName;

        let baseColorHex = customColors?.[meshName] || '#' + (mesh.userData.originalColor || "cccccc");
        let finalColor = new THREE.Color(customColors?.[meshName] || (isHighlighted ? '#10b981' : baseColorHex));

        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((mat: any) => {
          if (!mat) return;
          if (isGhosted) {
            mat.color.set('#3f414a');
            mat.transparent = true;
            mat.opacity = 0.15;
            mat.wireframe = true;
          } else {
            mat.color.set(finalColor);
            mat.transparent = isXRay;
            mat.opacity = isXRay ? 0.45 : 1;
            mat.wireframe = isXRay;

            if (isXRay) {
              mat.emissive?.set(finalColor);
              if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = 1.0;
            } else if (isCinematic) {
              mat.roughness = 0.2;
              mat.metalness = 0.8;
              mat.emissive?.set(isHighlighted ? '#059669' : '#111111');
            } else {
              mat.roughness = 0.6;
              mat.metalness = 0.1;
              mat.emissive?.set('#000000');
            }
          }
        });
      }
    });
  }, [currentScene, highlightPart, isolateMode, customColors, lightingPreset]);

  // Determine the 3D pin placement position
  const labelPosition = useMemo<[number, number, number] | null>(() => {
    if (!highlightPart) return null;
    
    // First, check if there's a custom pin position recorded in local storage
    try {
      const saved = localStorage.getItem('tester_pro_3d_pins');
      if (saved) {
        const parsed = JSON.parse(saved);
        const pin = parsed[getModelStorageKey(url)]?.[highlightPart];
        if (pin && Array.isArray(pin)) {
          return pin as [number, number, number];
        }
      }
    } catch (e) {
      // ignore
    }

    // Default to the submesh's center bounding box
    let centerPoint = new THREE.Vector3();
    let meshFound = false;

    currentScene.traverse((child: any) => {
      if (child.isMesh && !meshFound) {
        const meshName = child.name || child.id.toString();
        if (meshName === highlightPart) {
          child.geometry.computeBoundingBox();
          const bbox = child.geometry.boundingBox;
          if (bbox) {
            bbox.getCenter(centerPoint);
            child.updateMatrixWorld(true);
            centerPoint.applyMatrix4(child.matrixWorld);
            meshFound = true;
          }
        }
      }
    });

    return meshFound ? [centerPoint.x, centerPoint.y, centerPoint.z] : [0, 1, 0];
  }, [currentScene, highlightPart, url]);

  return (
    <group ref={groupRef}>
      <primitive 
        object={currentScene} 
        onClick={(e: any) => {
          e.stopPropagation();
          if (e.object && e.object.isMesh) {
            const meshName = e.object.name || e.object.id.toString();
            // Convert clicked world position to a point local to this group
            const relativePoint = groupRef.current ? groupRef.current.worldToLocal(e.point.clone()) : e.point;
            const ptArray: [number, number, number] = [relativePoint.x, relativePoint.y, relativePoint.z];
            
            // Save this exact click point so we can place the annotation pin directly on it!
            try {
              const saved = localStorage.getItem('tester_pro_3d_pins') || '{}';
              const parsed = JSON.parse(saved);
              const sKey = getModelStorageKey(url);
              parsed[sKey] = parsed[sKey] || {};
              parsed[sKey][meshName] = ptArray;
              localStorage.setItem('tester_pro_3d_pins', JSON.stringify(parsed));
            } catch (err) {
              // ignore
            }

            onPartClick?.(meshName, ptArray, e);
          }
        }}
        onDoubleClick={(e: any) => {
          e.stopPropagation();
          if (e.object && e.object.isMesh) {
            onPartDoubleClick?.(e.point);
          }
        }}
      />
      
      {highlightPart && highlightLabel && labelPosition && (
        <group position={labelPosition}>
          <FloatingTag text={highlightLabel} color={highlightLabelColor || '#10b981'} />
        </group>
      )}
    </group>
  );
}

// Procedural Models
interface ModelProps {
  highlightPart: string;
  onPartClick?: (part: string, point?: [number, number, number], event?: any) => void;
  onPartDoubleClick?: (point: THREE.Vector3) => void;
  customColors?: Record<string, string>;
  lightingPreset?: 'clinical' | 'xray' | 'cinematic';
  explodeFactor?: number;
  isolateMode?: boolean;
  highlightLabel?: string;
  highlightLabelColor?: string;
}

function SkullModel({ highlightPart, onPartClick, onPartDoubleClick, customColors, lightingPreset, explodeFactor = 0, isolateMode = false, highlightLabel, highlightLabelColor }: ModelProps) {
  const meshRef = useRef<THREE.Group>(null);
  const isXRay = lightingPreset === 'xray';
  const isCinematic = lightingPreset === 'cinematic';

  const getMat = (partKey: string, defaultColor: string) => {
    const isHighlighted = highlightPart === partKey;
    const isGhosted = isolateMode && highlightPart && highlightPart !== partKey;
    const color = customColors?.[partKey] || (isHighlighted ? '#10b981' : defaultColor);

    if (isGhosted) {
      return {
        color: '#3f414a',
        transparent: true,
        opacity: 0.08,
        wireframe: true,
      };
    }

    if (isXRay) {
      return {
        color: color,
        emissive: color,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.45,
        wireframe: true,
      };
    }
    if (isCinematic) {
      return {
        color: color,
        roughness: 0.15,
        metalness: 0.9,
        emissive: isHighlighted ? '#059669' : '#0a0a0a',
        emissiveIntensity: isHighlighted ? 0.6 : 0.1,
        transparent: false,
        opacity: 1,
      };
    }
    return {
      color: color,
      roughness: 0.6,
      metalness: 0.1,
      transparent: false,
      opacity: 1,
    };
  };

  const craniumYOffset = explodeFactor * 0.45;
  const mandibleYOffset = -explodeFactor * 0.55;
  const mandibleZOffset = explodeFactor * 0.35;

  return (
    <group ref={meshRef}>
      {/* Cranium Group (moves upward dynamically) */}
      <group position={[0, craniumYOffset, 0]}>
        <mesh 
          position={[0, 0.5, 0]} 
          onClick={(e) => {
            e.stopPropagation();
            onPartClick?.('cranium', undefined, e);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onPartDoubleClick?.(e.point);
          }}
        >
          <sphereGeometry args={[1, 32, 32]} />
          <meshStandardMaterial {...getMat('cranium', '#e5e7eb')} />
        </mesh>
        {highlightPart === 'cranium' && highlightLabel && (
          <group position={[0, 1.2, 0.4]}>
            <FloatingTag text={highlightLabel} color={highlightLabelColor || '#10b981'} />
          </group>
        )}
        {/* Eye Sockets */}
        <mesh position={[-0.4, 0.6, 0.8]}>
          <sphereGeometry args={[0.25, 16, 16]} />
          <meshStandardMaterial color="#111111" roughness={0.9} />
        </mesh>
        <mesh position={[0.4, 0.6, 0.8]}>
          <sphereGeometry args={[0.25, 16, 16]} />
          <meshStandardMaterial color="#111111" roughness={0.9} />
        </mesh>
        {/* Nose Hole */}
        <mesh position={[0, 0.2, 0.95]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.15, 0.3, 4]} />
          <meshStandardMaterial color="#111111" roughness={0.9} />
        </mesh>
      </group>

      {/* Mandible Group (moves forward & down) */}
      <group position={[0, mandibleYOffset, mandibleZOffset]}>
        <mesh 
          position={[0, -0.3, 0.3]}
          onClick={(e) => {
            e.stopPropagation();
            onPartClick?.('mandible', undefined, e);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onPartDoubleClick?.(e.point);
          }}
        >
          <boxGeometry args={[1.2, 0.8, 1]} />
          <meshStandardMaterial {...getMat('mandible', '#e5e7eb')} />
        </mesh>
        {highlightPart === 'mandible' && highlightLabel && (
          <group position={[0, -0.1, 0.8]}>
            <FloatingTag text={highlightLabel} color={highlightLabelColor || '#3b82f6'} />
          </group>
        )}
      </group>
    </group>
  );
}

function JawModel({ highlightPart, onPartClick, onPartDoubleClick, customColors, lightingPreset, explodeFactor = 0, isolateMode = false, highlightLabel, highlightLabelColor }: ModelProps) {
  const isXRay = lightingPreset === 'xray';
  const isCinematic = lightingPreset === 'cinematic';

  const getMat = (partKey: string, defaultColor: string) => {
    const isHighlighted = highlightPart === partKey;
    const isGhosted = isolateMode && highlightPart && highlightPart !== partKey;
    const color = customColors?.[partKey] || (isHighlighted ? '#10b981' : defaultColor);

    if (isGhosted) {
      return {
        color: '#3f414a',
        transparent: true,
        opacity: 0.08,
        wireframe: true,
      };
    }

    if (isXRay) {
      return {
        color: color,
        emissive: color,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.45,
        wireframe: true,
      };
    }
    if (isCinematic) {
      return {
        color: color,
        roughness: 0.15,
        metalness: 0.9,
        emissive: isHighlighted ? '#059669' : '#0a0a0a',
        emissiveIntensity: isHighlighted ? 0.6 : 0.1,
        transparent: false,
        opacity: 1,
      };
    }
    return {
      color: color,
      roughness: 0.6,
      metalness: 0.1,
      transparent: false,
      opacity: 1,
    };
  };

  const teethYOffset = explodeFactor * 0.45;
  const baseJawYOffset = -explodeFactor * 0.15;

  return (
    <group>
      {/* Lower Jaw Arc */}
      <mesh 
        position={[0, baseJawYOffset, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onPartClick?.('mandible', undefined, e);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onPartDoubleClick?.(e.point);
        }}
      >
        <torusGeometry args={[1, 0.3, 16, 32, Math.PI]} />
        <meshStandardMaterial {...getMat('mandible', '#e5e7eb')} />
      </mesh>
      {highlightPart === 'mandible' && highlightLabel && (
        <group position={[0, baseJawYOffset + 0.3, 0.9]}>
          <FloatingTag text={highlightLabel} color={highlightLabelColor || '#f59e0b'} />
        </group>
      )}
      {/* Teeth bits (slide upwards out of the gums) */}
      <group position={[0, teethYOffset, 0]}>
        {[-0.8, -0.5, -0.2, 0.2, 0.5, 0.8].map((x, i) => (
          <mesh key={i} position={[x, 0.4, 0.9 * Math.cos(x)]}>
            <boxGeometry args={[0.15, 0.3, 0.15]} />
            <meshStandardMaterial color="#ffffff" roughness={0.2} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function BrainModel({ highlightPart, onPartClick, onPartDoubleClick, customColors, lightingPreset, explodeFactor = 0, isolateMode = false, highlightLabel, highlightLabelColor }: ModelProps) {
  const isXRay = lightingPreset === 'xray';
  const isCinematic = lightingPreset === 'cinematic';

  const getMat = (partKey: string, defaultColor: string) => {
    const isHighlighted = highlightPart === partKey;
    const isGhosted = isolateMode && highlightPart && highlightPart !== partKey;
    const color = customColors?.[partKey] || (isHighlighted ? '#10b981' : defaultColor);

    if (isGhosted) {
      return {
        color: '#3f414a',
        transparent: true,
        opacity: 0.08,
        wireframe: true,
      };
    }

    if (isXRay) {
      return {
        color: color,
        emissive: color,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.45,
        wireframe: true,
      };
    }
    if (isCinematic) {
      return {
        color: color,
        roughness: 0.15,
        metalness: 0.9,
        emissive: isHighlighted ? '#059669' : '#0a0a0a',
        emissiveIntensity: isHighlighted ? 0.6 : 0.1,
        transparent: false,
        opacity: 1,
      };
    }
    return {
      color: color,
      roughness: 0.6,
      metalness: 0.1,
      transparent: false,
      opacity: 1,
    };
  };

  const leftXOffset = -explodeFactor * 0.45;
  const rightXOffset = explodeFactor * 0.45;
  const cerebellumYOffset = -explodeFactor * 0.40;
  const cerebellumZOffset = -explodeFactor * 0.45;

  return (
    <group>
      {/* Left Hemisphere */}
      <mesh 
        position={[-0.5 + leftXOffset, 0, 0]} 
        scale={[0.8, 1, 1.2]}
        onClick={(e) => {
          e.stopPropagation();
          onPartClick?.('left', undefined, e);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onPartDoubleClick?.(e.point);
        }}
      >
        <sphereGeometry args={[0.8, 32, 32]} />
        <meshStandardMaterial {...getMat('left', '#fecaca')} />
      </mesh>
      {highlightPart === 'left' && highlightLabel && (
        <group position={[-0.6 + leftXOffset, 0.3, 0.6]}>
          <FloatingTag text={highlightLabel} color={highlightLabelColor || '#a855f7'} />
        </group>
      )}

      {/* Right Hemisphere */}
      <mesh 
        position={[0.5 + rightXOffset, 0, 0]} 
        scale={[0.8, 1, 1.2]}
        onClick={(e) => {
          e.stopPropagation();
          onPartClick?.('right', undefined, e);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onPartDoubleClick?.(e.point);
        }}
      >
        <sphereGeometry args={[0.8, 32, 32]} />
        <meshStandardMaterial {...getMat('right', '#fecaca')} />
      </mesh>
      {highlightPart === 'right' && highlightLabel && (
        <group position={[0.6 + rightXOffset, 0.3, 0.6]}>
          <FloatingTag text={highlightLabel} color={highlightLabelColor || '#ec4899'} />
        </group>
      )}

      {/* Cerebellum */}
      <mesh 
        position={[0, -0.6 + cerebellumYOffset, -0.6 + cerebellumZOffset]} 
        scale={[1, 0.5, 0.8]}
        onClick={(e) => {
          e.stopPropagation();
          onPartClick?.('cerebellum', undefined, e);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onPartDoubleClick?.(e.point);
        }}
      >
        <sphereGeometry args={[0.6, 32, 32]} />
        <meshStandardMaterial {...getMat('cerebellum', '#fca5a5')} />
      </mesh>
      {highlightPart === 'cerebellum' && highlightLabel && (
        <group position={[0, -0.5 + cerebellumYOffset, -1.0 + cerebellumZOffset]}>
          <FloatingTag text={highlightLabel} color={highlightLabelColor || '#10b981'} />
        </group>
      )}
    </group>
  );
}

function FocusZoomController({ 
  targetPoint, 
  orbitRef 
}: { 
  targetPoint: THREE.Vector3 | null; 
  orbitRef: React.RefObject<any>;
}) {
  const hasFocusedRef = useRef(false);

  useEffect(() => {
    hasFocusedRef.current = false;
  }, [targetPoint]);

  useEffect(() => {
    const controls = orbitRef.current;
    if (!controls) return;

    const cancelFocus = () => {
      hasFocusedRef.current = true;
    };
    controls.addEventListener('start', cancelFocus);
    return () => controls.removeEventListener('start', cancelFocus);
  }, [orbitRef, targetPoint]);

  useFrame((state) => {
    if (!targetPoint || !orbitRef.current || hasFocusedRef.current) return;

    const controls = orbitRef.current;
    const camera = state.camera;

    // smooth interpolation of camera focus target
    controls.target.lerp(targetPoint, 0.08);

    // zoom in to closeup range
    const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    const desiredDistance = 1.8;
    const targetCameraPosition = new THREE.Vector3()
      .copy(controls.target)
      .addScaledVector(direction, desiredDistance);

    camera.position.lerp(targetCameraPosition, 0.08);
    controls.update();

    if (camera.position.distanceTo(controls.target) <= desiredDistance + 0.03) {
      hasFocusedRef.current = true;
    }
  });

  return null;
}

interface Viewer3DProps {
  activeModel: string;
  highlightPart: string;
  onModelChange: (model: string) => void;
  onPartClick?: (part: string, point?: [number, number, number], event?: any) => void;
  autoRotate?: boolean;
  lightingPreset?: 'clinical' | 'xray' | 'cinematic';
  showGrid?: boolean;
  customColors?: Record<string, string>;
  explodeFactor?: number;
  isolateMode?: boolean;
  cameraPreset?: string;
  onCameraPresetReset?: () => void;
  language?: 'uz' | 'ru' | 'en';
  highlightLabel?: string;
  highlightLabelColor?: string;
  theme?: 'light' | 'dark';
  blenderLoopMode?: boolean;
  studentMode?: boolean;
}

export default function Viewer3D({ 
  activeModel, 
  highlightPart, 
  onModelChange, 
  onPartClick,
  autoRotate = false,
  lightingPreset = 'clinical',
  showGrid = true,
  customColors = {},
  explodeFactor = 0,
  isolateMode = false,
  cameraPreset = '',
  onCameraPresetReset,
  language = 'ru',
  highlightLabel,
  highlightLabelColor,
  theme = 'light',
  blenderLoopMode = false,
  studentMode = false
}: Viewer3DProps) {
  const [resolvedActiveModel, setResolvedActiveModel] = useState(activeModel);
  const [localShowGrid, setLocalShowGrid] = useState(showGrid && !studentMode);
  const [pureWhiteBg, setPureWhiteBg] = useState(false);
  const [localLanguage, setLocalLanguage] = useState<'uz' | 'ru' | 'en'>(language);
  const orbitRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    void mediaStore.resolve(activeModel).then((resolved) => {
      if (!cancelled) setResolvedActiveModel(resolved || activeModel);
    });
    return () => { cancelled = true; };
  }, [activeModel]);

  // Active tool state ('select' | 'paint' | 'annotation')
  const [activeTool, setActiveTool] = useState<'select' | 'paint' | 'annotation'>('select');
  const [selectedBrushColor, setSelectedBrushColor] = useState('#ef4444');
  
  // Custom Annotation states
  interface CustomAnnotation {
    id: string;
    position: [number, number, number];
    labelOffset?: [number, number, number];
    name?: string;
    language?: 'uz' | 'ru' | 'en';
    nameRu: string;
    nameUz: string;
    nameEn?: string;
    nameLa?: string;
    color: string;
  }
  const [localAnnotations, setLocalAnnotations] = useState<CustomAnnotation[]>([]);
  const [showAnnotationModal, setShowAnnotationModal] = useState(false);
  const [pendingAnnotationPos, setPendingAnnotationPos] = useState<[number, number, number] | null>(null);
  const [newAnnoName, setNewAnnoName] = useState('');
  const [newAnnoLa, setNewAnnoLa] = useState('');
  const [newAnnoColor, setNewAnnoColor] = useState('#ef4444');
  const [isPinsPanelOpen, setIsPinsPanelOpen] = useState(true);

  const filteredAnnotations = useMemo(() => {
    return localAnnotations.filter(anno => {
      const annoLang = anno.language || 'ru';
      return annoLang === localLanguage;
    });
  }, [localAnnotations, localLanguage]);

  // Editing states for existing annotations
  const [editingAnnoId, setEditingAnnoId] = useState<string | null>(null);
  const [editAnnoName, setEditAnnoName] = useState('');
  const [editAnnoLa, setEditAnnoLa] = useState('');
  const [editAnnoColor, setEditAnnoColor] = useState('#ef4444');

  // Dragging states and side-effects
  const [draggingAnnoId, setDraggingAnnoId] = useState<string | null>(null);
  const [draggingLabelId, setDraggingLabelId] = useState<string | null>(null);

  useEffect(() => {
    if (draggingAnnoId || draggingLabelId) {
      document.body.style.cursor = 'grabbing';
    } else {
      document.body.style.cursor = 'auto';
    }
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [draggingAnnoId, draggingLabelId]);

  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (draggingAnnoId) {
        setDraggingAnnoId(null);
      }
      if (draggingLabelId) {
        setDraggingLabelId(null);
      }
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
    };
  }, [draggingAnnoId, draggingLabelId]);

  const updateAnnotationPosition = (id: string, newPos: [number, number, number]) => {
    setLocalAnnotations(prev => {
      const updated = prev.map(anno => anno.id === id ? { ...anno, position: newPos } : anno);
      try {
        const saved = localStorage.getItem('tester_pro_3d_free_annotations') || '{}';
        const parsed = JSON.parse(saved);
        const sKey = getModelStorageKey(activeModel);
        parsed[sKey] = updated;
        localStorage.setItem('tester_pro_3d_free_annotations', JSON.stringify(parsed));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };

  const updateLabelOffset = (id: string, newOffset: [number, number, number]) => {
    setLocalAnnotations(prev => {
      const updated = prev.map(anno => anno.id === id ? { ...anno, labelOffset: newOffset } : anno);
      try {
        const saved = localStorage.getItem('tester_pro_3d_free_annotations') || '{}';
        const parsed = JSON.parse(saved);
        const sKey = getModelStorageKey(activeModel);
        parsed[sKey] = updated;
        localStorage.setItem('tester_pro_3d_free_annotations', JSON.stringify(parsed));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };

  const updateAnnotation = (id: string, name: string, language: 'uz' | 'ru' | 'en', nameLa: string, color: string) => {
    setLocalAnnotations(prev => {
      const updated = prev.map(anno => anno.id === id ? { 
        ...anno, 
        name, 
        language, 
        nameLa, 
        nameRu: language === 'ru' ? name : anno.nameRu,
        nameUz: language === 'uz' ? name : anno.nameUz,
        nameEn: language === 'en' ? name : anno.nameEn,
        color 
      } : anno);
      try {
        const saved = localStorage.getItem('tester_pro_3d_free_annotations') || '{}';
        const parsed = JSON.parse(saved);
        const sKey = getModelStorageKey(activeModel);
        parsed[sKey] = updated;
        localStorage.setItem('tester_pro_3d_free_annotations', JSON.stringify(parsed));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };

  useEffect(() => {
    if (showAnnotationModal) {
      setNewAnnoName('');
    }
  }, [showAnnotationModal]);

  // Ref for localizing 3D click points
  const floatingGroupRef = useRef<THREE.Group>(null);

  // Sync prop colors
  const [localCustomColors, setLocalCustomColors] = useState<Record<string, string>>(customColors);
  useEffect(() => {
    setLocalCustomColors(customColors);
  }, [customColors]);

  // Load custom annotations on activeModel change
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tester_pro_3d_free_annotations');
      if (saved) {
        const parsed = JSON.parse(saved);
        const sKey = getModelStorageKey(activeModel);
        setLocalAnnotations(parsed[sKey] || []);
      } else {
        setLocalAnnotations([]);
      }
    } catch (e) {
      setLocalAnnotations([]);
    }
  }, [activeModel]);

  const saveNewAnnotation = () => {
    const trimmed = newAnnoName.trim();
    const trimmedLa = newAnnoLa.trim();
    if (!trimmed || !pendingAnnotationPos) return;

    const newAnno: CustomAnnotation = {
      id: Math.random().toString(),
      position: pendingAnnotationPos,
      name: trimmed,
      language: localLanguage,
      nameRu: trimmed,
      nameUz: trimmed,
      nameEn: trimmed,
      nameLa: trimmedLa,
      color: newAnnoColor,
    };

    const updated = [...localAnnotations, newAnno];
    setLocalAnnotations(updated);

    try {
      const saved = localStorage.getItem('tester_pro_3d_free_annotations') || '{}';
      const parsed = JSON.parse(saved);
      const sKey = getModelStorageKey(activeModel);
      parsed[sKey] = updated;
      localStorage.setItem('tester_pro_3d_free_annotations', JSON.stringify(parsed));
    } catch (e) {
      console.error(e);
    }

    setNewAnnoName('');
    setNewAnnoLa('');
    setNewAnnoColor('#ef4444');
    setPendingAnnotationPos(null);
    setShowAnnotationModal(false);
  };

  const deleteAnnotation = (id: string) => {
    const updated = localAnnotations.filter(a => a.id !== id);
    setLocalAnnotations(updated);

    try {
      const saved = localStorage.getItem('tester_pro_3d_free_annotations') || '{}';
      const parsed = JSON.parse(saved);
      const sKey = getModelStorageKey(activeModel);
      parsed[sKey] = updated;
      localStorage.setItem('tester_pro_3d_free_annotations', JSON.stringify(parsed));
    } catch (e) {
      console.error(e);
    }
  };

  const focusOnAnnotation = (position: [number, number, number]) => {
    const vector = new THREE.Vector3(...position);
    setZoomTarget(vector);
  };

  const handlePaintMesh = (part: string) => {
    const updatedColors = { ...localCustomColors, [part]: selectedBrushColor };
    setLocalCustomColors(updatedColors);

    try {
      const saved = localStorage.getItem('tester_pro_3d_labels') || '{}';
      const parsed = JSON.parse(saved);
      const sKey = getModelStorageKey(activeModel);
      parsed[sKey] = parsed[sKey] || {};

      if (!parsed[sKey][part]) {
        const cleanName = part.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
        parsed[sKey][part] = {
          nameRu: `${cleanName} (Разметка)`,
          nameUz: `${cleanName} (Belgilangan)`,
          description: ''
        };
      }

      parsed[sKey][part].color = selectedBrushColor;
      localStorage.setItem('tester_pro_3d_labels', JSON.stringify(parsed));

      window.dispatchEvent(new CustomEvent('tester_pro_labels_updated', {
        detail: { modelId: activeModel, labels: parsed[sKey] }
      }));
    } catch (e) {
      console.error(e);
    }
  };
  
  // Custom double click Focus Zoom state
  const [zoomTarget, setZoomTarget] = useState<THREE.Vector3 | null>(null);

  const handlePartDoubleClick = (point: THREE.Vector3) => {
    setZoomTarget(point);
  };

  // Reset focus target when the model is switched
  useEffect(() => {
    setZoomTarget(null);
  }, [activeModel]);

  // Resolve highlightLabel and highlightLabelColor if not explicitly provided
  const resolvedLabel = useMemo(() => {
    if (highlightLabel) return highlightLabel;
    if (!highlightPart) return '';
    
    // Check local storage for custom teacher-curated labels
    try {
      const saved = localStorage.getItem('tester_pro_3d_labels');
      if (saved) {
        const parsed = JSON.parse(saved);
        const info = parsed[getModelStorageKey(activeModel)]?.[highlightPart];
        if (info) {
          if (info.showArrow === false) {
            return '';
          }
          return language === 'ru' ? info.nameRu : info.nameUz;
        }
      }
    } catch (e) {
      // disregard
    }
    
    // Fallback to defaults
    const info = DEFAULT_MODEL_LABELS[activeModel]?.[highlightPart];
    if (info) {
      return language === 'ru' ? info.nameRu : info.nameUz;
    }
    
    return highlightPart;
  }, [highlightLabel, activeModel, highlightPart, language]);

  const resolvedLabelColor = useMemo(() => {
    if (highlightLabelColor) return highlightLabelColor;
    if (!highlightPart) return '';
    
    try {
      const saved = localStorage.getItem('tester_pro_3d_labels');
      if (saved) {
        const parsed = JSON.parse(saved);
        const info = parsed[getModelStorageKey(activeModel)]?.[highlightPart];
        if (info) return info.color;
      }
    } catch (e) {
      // disregard
    }
    
    const info = DEFAULT_MODEL_LABELS[activeModel]?.[highlightPart];
    if (info) return info.color;
    
    return '#10b981';
  }, [highlightLabelColor, activeModel, highlightPart]);

  const resetCamera = () => {
    setZoomTarget(null);
    if (orbitRef.current) {
      orbitRef.current.reset();
    }
  };

  const isBuiltIn = ['skull', 'jaw', 'brain'].includes(activeModel);

  // Blender Loop Selector state tracks if a loop select has been clicked or is enabled
  const [localBlenderLoopActive, setLocalBlenderLoopActive] = useState(false);

  // Sync state
  useEffect(() => {
    if (blenderLoopMode) {
      setLocalBlenderLoopActive(true);
    } else {
      setLocalBlenderLoopActive(false);
    }
  }, [blenderLoopMode]);

  const loopElements = useMemo(() => {
    if (activeModel === 'skull') {
      return ['cranium', 'mandible'];
    }
    if (activeModel === 'jaw') {
      return ['mandible'];
    }
    if (activeModel === 'brain') {
      return ['left', 'right', 'cerebellum'];
    }
    // Fallback to label keys
    try {
      const saved = localStorage.getItem('tester_pro_3d_labels');
      if (saved) {
        const parsed = JSON.parse(saved);
        const sKey = getModelStorageKey(activeModel);
        if (parsed[sKey]) {
          return Object.keys(parsed[sKey]);
        }
      }
    } catch (e) {}
    
    const defaults = DEFAULT_MODEL_LABELS[activeModel];
    if (defaults) {
      return Object.keys(defaults);
    }
    return [];
  }, [activeModel]);

  const handleCycleLoop = (direction: number) => {
    if (loopElements.length === 0) return;
    const currentIndex = loopElements.indexOf(highlightPart);
    let nextIndex = currentIndex + direction;
    if (nextIndex >= loopElements.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = loopElements.length - 1;
    
    const nextPart = loopElements[nextIndex];
    if (nextPart && onPartClick) {
      onPartClick(nextPart);
    }
  };

  const handleViewerPartClick = (part: string, point?: [number, number, number], event?: any) => {
    if (activeTool === 'paint') {
      handlePaintMesh(part);
      return;
    }

    if (activeTool === 'annotation') {
      if (event && event.point && floatingGroupRef.current) {
        // Convert world coordinates of click to floatingGroup's local space
        const localPoint = floatingGroupRef.current.worldToLocal(event.point.clone());
        const ptArray: [number, number, number] = [localPoint.x, localPoint.y, localPoint.z];
        setPendingAnnotationPos(ptArray);
        setShowAnnotationModal(true);
      }
      return;
    }

    if (event?.altKey || blenderLoopMode) {
      setLocalBlenderLoopActive(true);
    }
    onPartClick?.(part, point, event);
  };

  // Sync prop changes with local state
  useMemo(() => {
    setLocalShowGrid(showGrid && !studentMode);
  }, [showGrid, studentMode]);

  // Hook for camera position presets
  useEffect(() => {
    if (!cameraPreset || !orbitRef.current) return;
    
    const orbit = orbitRef.current;
    if (cameraPreset === 'front') {
      orbit.object.position.set(0, 0, 4.5);
    } else if (cameraPreset === 'top') {
      orbit.object.position.set(0, 4.5, 0.01);
    } else if (cameraPreset === 'side') {
      orbit.object.position.set(4.5, 0, 0);
    } else if (cameraPreset === 'isometric') {
      orbit.object.position.set(2.8, 2.2, 2.8);
    }
    orbit.target.set(0, 0, 0);
    orbit.update();

    onCameraPresetReset?.();
  }, [cameraPreset, onCameraPresetReset]);

  return (
    <div className={cn(
      "w-full h-full relative overflow-hidden flex flex-col p-0 m-0 transition-all duration-300",
      pureWhiteBg
        ? "bg-white"
        : theme === 'dark' 
          ? "bg-[#0F1115] [background:radial-gradient(circle_at_center,#1A1D23_0%,#0F1115_100%)]" 
          : "bg-slate-50 [background:radial-gradient(circle_at_center,#ffffff_0%,#f1f5f9_100%)]"
    )}>
      {/* Top Controls */}
      {!studentMode && <div className={cn(
        "absolute top-[20px] left-1/2 -translate-x-1/2 z-10 flex gap-1 p-[6px] border rounded-[12px] shadow-lg backdrop-blur-[8px] transition-all duration-300",
        theme === 'dark'
          ? "bg-[#16191E]/80 border-[#2D3139]"
          : "bg-white/80 border-slate-200/80 shadow-slate-100"
      )}>
        <button 
          onClick={resetCamera} 
          className={cn(
            "w-9 h-9 flex items-center justify-center transition-colors rounded-lg", 
            theme === 'dark' ? "text-[#9CA3AF] hover:text-[#3B82F6]" : "text-[#64748B] hover:text-indigo-600 hover:bg-slate-100"
          )} 
          title="Reset Rotation"
        >
          <RotateCw size={18} />
        </button>
        {/* Select Tool */}
        <button 
          onClick={() => setActiveTool('select')}
          className={cn(
            "w-9 h-9 flex items-center justify-center rounded-lg transition-all", 
            activeTool === 'select'
              ? (theme === 'dark' ? "text-[#3B82F6] bg-[#3B82F6]/10" : "text-indigo-600 bg-indigo-50")
              : (theme === 'dark' ? "text-[#9CA3AF] hover:text-[#3B82F6]" : "text-[#64748B] hover:text-indigo-600 hover:bg-slate-100")
          )} 
          title={language === 'ru' ? 'Режим инспектирования' : 'Ko‘rish rejimi'}
        >
          <MousePointer2 size={18} />
        </button>
        {/* Paint brush Tool */}
        <button 
          onClick={() => setActiveTool('paint')}
          className={cn(
            "w-9 h-9 flex items-center justify-center rounded-lg transition-all", 
            activeTool === 'paint'
              ? (theme === 'dark' ? "text-[#10b981] bg-[#10b981]/10" : "text-emerald-600 bg-emerald-50")
              : (theme === 'dark' ? "text-[#9CA3AF] hover:text-[#10b981]" : "text-[#64748B] hover:text-emerald-600 hover:bg-slate-100")
          )} 
          title={language === 'ru' ? 'Покраска областей' : 'Ranglash asbobi'}
        >
          <Paintbrush size={18} />
        </button>
        {/* Add Annotation Pin Tool */}
        <button 
          onClick={() => setActiveTool('annotation')}
          className={cn(
            "w-9 h-9 flex items-center justify-center rounded-lg transition-all", 
            activeTool === 'annotation'
              ? (theme === 'dark' ? "text-[#a855f7] bg-[#a855f7]/10" : "text-purple-600 bg-purple-50")
              : (theme === 'dark' ? "text-[#9CA3AF] hover:text-[#a855f7]" : "text-[#64748B] hover:text-purple-600 hover:bg-slate-100")
          )} 
          title={language === 'ru' ? 'Добавить 3D стрелку/подпись' : '3D strelka va nom qo‘shish'}
        >
          <Pin size={18} />
        </button>
        <button 
          onClick={() => setLocalShowGrid(!localShowGrid)}
          className={cn(
            "w-9 h-9 flex items-center justify-center transition-colors rounded-lg",
            localShowGrid 
              ? (theme === 'dark' ? 'text-[#3B82F6] bg-[#3B82F6]/10' : 'text-indigo-600 bg-indigo-50') 
              : (theme === 'dark' ? 'text-[#9CA3AF] hover:text-[#3B82F6]' : 'text-[#64748B] hover:text-indigo-600 hover:bg-slate-100')
          )} 
          title="Toggle Grid"
        >
          {localShowGrid ? <Eye size={18} /> : <EyeOff size={18} />}
        </button>
        <button 
          onClick={() => setPureWhiteBg(!pureWhiteBg)}
          className={cn(
            "w-9 h-9 flex items-center justify-center transition-all rounded-lg",
            pureWhiteBg 
              ? "text-amber-500 bg-amber-500/10" 
              : (theme === 'dark' ? "text-[#9CA3AF] hover:text-[#3B82F6]" : "text-[#64748B] hover:text-indigo-600 hover:bg-slate-100")
          )} 
          title={language === 'uz' ? "Fonni o‘zgartirish" : "Переключение фона"}
        >
          {pureWhiteBg ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>}

      {/* Main Surface */}
      <div className="absolute inset-0 cursor-grab active:cursor-grabbing">
        <ErrorBoundary 
          fallback={
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/95 rounded-2xl p-6 text-center border border-red-900/30 z-[100]">
              <AlertOctagon className="text-red-500 mb-2 animate-pulse" size={28} />
              <h4 className="text-[11px] font-black uppercase text-red-500 tracking-widest leading-none mb-1.5 font-sans">
                {language === 'ru' ? 'ОШИБКА 3D ВИЗУАЛИЗАЦИИ' : '3D VIZUALIZATSIYA XATOLIGI'}
              </h4>
              <p className="text-[10px] text-zinc-500 max-w-[200px] leading-tight mb-4 font-sans">
                {language === 'ru' 
                  ? 'Не удалось загрузить или отобразить этот 3D файл.' 
                  : 'Ushbu 3D faylni yuklash yoki ko‘rsatish imkoni bo‘lmadi.'}
              </p>
              <button 
                onClick={() => {
                  try {
                    localStorage.removeItem('tester_pro_3d_labels');
                    localStorage.removeItem('tester_pro_3d_pins');
                  } catch (e) {}
                  window.location.reload();
                }}
                className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg transition-all cursor-pointer"
              >
                {language === 'ru' ? 'Сбросить' : 'Qayta yuklash'}
              </button>
            </div>
          }
        >
          <Canvas
            shadows={!studentMode}
            dpr={studentMode ? [1, 1.5] : undefined}
            gl={{ localClippingEnabled: true, powerPreference: 'low-power' }}
          >
            <PerspectiveCamera makeDefault position={[0, 0, 4.5]} fov={50} />
            
            {/* Preset Lights */}
            {lightingPreset === 'clinical' && (
              <>
                <ambientLight intensity={0.7} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1.5} castShadow />
                <pointLight position={[-10, -10, -10]} intensity={0.5} />
              </>
            )}

            {lightingPreset === 'xray' && (
              <>
                <ambientLight intensity={0.2} color="#4f46e5" />
                <pointLight position={[0, 0, 5]} intensity={1.5} color="#818cf8" />
                <pointLight position={[3, 3, 3]} intensity={1.0} color="#a78bfa" />
                <pointLight position={[-3, -3, -3]} intensity={1.0} color="#c084fc" />
              </>
            )}

            {lightingPreset === 'cinematic' && (
              <>
                <ambientLight intensity={0.3} color="#000000" />
                <spotLight position={[5, 5, 5]} angle={0.2} penumbra={1} intensity={2.5} color="#ec4899" castShadow />
                <spotLight position={[-5, 5, -5]} angle={0.3} penumbra={1} intensity={2.0} color="#3b82f6" />
                <directionalLight position={[0, -5, 0]} intensity={0.5} color="#10b981" />
              </>
            )}
            
            <Suspense fallback={null}>
              <Center top>
                <group>
                  <group 
                    ref={floatingGroupRef}
                    onPointerMove={(e) => {
                      if (draggingAnnoId) {
                        e.stopPropagation();
                        if (e.point && floatingGroupRef.current) {
                          const localPoint = floatingGroupRef.current.worldToLocal(e.point.clone());
                          updateAnnotationPosition(draggingAnnoId, [localPoint.x, localPoint.y, localPoint.z]);
                        }
                      }
                    }}
                    onPointerUp={(e) => {
                      if (draggingAnnoId) {
                        e.stopPropagation();
                        setDraggingAnnoId(null);
                      }
                    }}
                  >
                    {activeModel === 'skull' && <SkullModel highlightPart={highlightPart} onPartClick={handleViewerPartClick} onPartDoubleClick={handlePartDoubleClick} customColors={localCustomColors} lightingPreset={lightingPreset} explodeFactor={explodeFactor} isolateMode={isolateMode} highlightLabel={resolvedLabel} highlightLabelColor={resolvedLabelColor} />}
                    {activeModel === 'jaw' && <JawModel highlightPart={highlightPart} onPartClick={handleViewerPartClick} onPartDoubleClick={handlePartDoubleClick} customColors={localCustomColors} lightingPreset={lightingPreset} explodeFactor={explodeFactor} isolateMode={isolateMode} highlightLabel={resolvedLabel} highlightLabelColor={resolvedLabelColor} />}
                    {activeModel === 'brain' && <BrainModel highlightPart={highlightPart} onPartClick={handleViewerPartClick} onPartDoubleClick={handlePartDoubleClick} customColors={localCustomColors} lightingPreset={lightingPreset} explodeFactor={explodeFactor} isolateMode={isolateMode} highlightLabel={resolvedLabel} highlightLabelColor={resolvedLabelColor} />}
                    {!isBuiltIn && resolvedActiveModel && <ExternalModel url={resolvedActiveModel} highlightPart={highlightPart} onPartClick={handleViewerPartClick} onPartDoubleClick={handlePartDoubleClick} customColors={localCustomColors} lightingPreset={lightingPreset} highlightLabel={resolvedLabel} highlightLabelColor={resolvedLabelColor} isolateMode={isolateMode} />}
                    
                    {filteredAnnotations.map((anno) => (
                      <CustomAnnotationMarker 
                        key={anno.id}
                        id={anno.id}
                        position={anno.position}
                        name={anno.name}
                        nameRu={anno.nameRu}
                        nameUz={anno.nameUz}
                        nameEn={anno.nameEn}
                        nameLa={anno.nameLa}
                        color={anno.color}
                        language={localLanguage}
                        onDelete={() => deleteAnnotation(anno.id)}
                        onDragStart={() => setDraggingAnnoId(anno.id)}
                        isDragging={draggingAnnoId === anno.id}
                        labelOffset={anno.labelOffset}
                        onLabelDragStart={() => setDraggingLabelId(anno.id)}
                        onLabelDragMove={(newOffset) => updateLabelOffset(anno.id, newOffset)}
                        onLabelDragEnd={() => setDraggingLabelId(null)}
                        isDraggingLabel={draggingLabelId === anno.id}
                      />
                    ))}
                  </group>
                </group>
              </Center>
              
              {!studentMode && <Environment preset="city" />}
              {!studentMode && (
                <ContactShadows resolution={512} scale={15} blur={1.5} opacity={0.35} far={6} color="#000" />
              )}
            </Suspense>

            <FocusZoomController targetPoint={zoomTarget} orbitRef={orbitRef} />

            {!studentMode && localShowGrid && (
              <Grid 
                infiniteGrid 
                fadeDistance={45} 
                sectionSize={1.2} 
                cellColor={pureWhiteBg ? "#cbd5e1" : (theme === 'dark' ? "#22252b" : "#cbd5e1")} 
                sectionColor={pureWhiteBg ? "#94a3b8" : (theme === 'dark' ? "#3d424e" : "#94a3b8")} 
                position={[0, -1.5, 0]} 
              />
            )}
            <OrbitControls 
              ref={orbitRef} 
              makeDefault 
              enablePan={true}
              enableRotate={true}
              enableZoom={true}
              screenSpacePanning={true}
              minDistance={0.8}
              maxDistance={16}
              zoomSpeed={1.25}
              rotateSpeed={1.1}
              panSpeed={1.1}
              enableDamping={true}
              dampingFactor={0.08}
              minPolarAngle={0} 
              maxPolarAngle={Math.PI} 
              autoRotate={autoRotate}
              autoRotateSpeed={1.8}
              enabled={!draggingAnnoId && !draggingLabelId}
            />
          </Canvas>
        </ErrorBoundary>
      </div>

      {/* 2D HUD HUD Overlay for Blender Loop Selector */}
      {!studentMode && localBlenderLoopActive && (
        <div className="absolute bottom-4 right-4 bg-zinc-950/90 border border-indigo-500/40 px-3.5 py-3 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.7)] flex flex-col gap-2 z-20 animate-fade-in max-w-[280px]">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-indigo-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-555"></span>
              </span>
              Blender Loop Rejimi
            </span>
            <button 
              onClick={() => setLocalBlenderLoopActive(false)}
              className="text-[8px] text-zinc-500 hover:text-zinc-300 font-bold uppercase tracking-wider cursor-pointer"
            >
              [X]
            </button>
          </div>

          <p className="text-[10px] text-zinc-300 font-semibold leading-relaxed">
            {language === 'ru' 
              ? 'Выбор замкнутыми петлями/циклами. Кликните деталь или используйте кнопки ниже для переключения:' 
              : 'Loop/tsikl tanlash rejimi. O‘tish uchun qismni bosing yoki tugmalardan foydalaning:'}
          </p>

          <div className="flex items-center justify-between gap-2 mt-1 bg-black/40 p-1.5 rounded-lg border border-zinc-850">
            <button
              onClick={() => handleCycleLoop(-1)}
              className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-750 hover:border-indigo-500 text-zinc-300 hover:text-white rounded-lg text-[9px] font-black uppercase transition-all cursor-pointer"
            >
              ◀ {language === 'ru' ? 'Пред' : 'Orqaga'}
            </button>

            <span className="text-[9.5px] font-mono font-black text-indigo-400 uppercase tracking-wide text-center shrink truncate max-w-[120px]">
              {highlightPart || (language === 'ru' ? 'Нет' : 'Yo‘q')}
            </span>

            <button
              onClick={() => handleCycleLoop(1)}
              className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-750 hover:border-indigo-500 text-zinc-300 hover:text-white rounded-lg text-[9px] font-black uppercase transition-all cursor-pointer"
            >
              {language === 'ru' ? 'След' : 'Oldinga'} ▶
            </button>
          </div>

          {loopElements.length > 0 && (
            <div className="flex flex-col gap-1 mt-1 border-t border-zinc-800/40 pt-2">
              <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">{language === 'ru' ? 'Сегменты в петле:' : 'Zanjir segmentlari:'}</span>
              <div className="flex flex-wrap items-center gap-1">
                {loopElements.map((el) => (
                  <button 
                    key={el}
                    onClick={() => onPartClick?.(el)}
                    className={cn(
                      "text-[8px] px-1.5 py-0.5 rounded-md font-mono font-black border uppercase transition-all cursor-pointer",
                      el === highlightPart 
                        ? "bg-indigo-500/15 border-indigo-500 text-indigo-400" 
                        : "bg-black/30 border-zinc-850 text-zinc-500 hover:text-zinc-400 hover:bg-black/50"
                    )}
                  >
                    {el}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Custom Overlays and Widgets */}

      {/* 1. Paint Mode Brush Palette */}
      {!studentMode && activeTool === 'paint' && (
        <div className={cn(
          "absolute bottom-4 left-1/2 -translate-x-1/2 z-20 p-3 rounded-2xl border shadow-2xl backdrop-blur-md flex flex-col gap-2 items-center min-w-[280px] transition-all duration-300 animate-fade-in",
          theme === 'dark' ? "bg-zinc-900/95 border-zinc-800 text-white" : "bg-white/95 border-zinc-200 text-zinc-800"
        )}>
          <div className="text-[9px] font-black uppercase tracking-wider text-zinc-400">
            🎨 {language === 'ru' ? 'ВЫБЕРИТЕ ЦВЕТ И КЛИКНИТЕ ДЕТАЛЬ' : 'RANGLASH REJIMI: DETALNI BOSING'}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            {['#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4', '#eab308'].map((color) => (
              <button
                key={color}
                onClick={() => setSelectedBrushColor(color)}
                className="w-7 h-7 rounded-full border-2 transition-transform cursor-pointer hover:scale-110 flex items-center justify-center relative"
                style={{ 
                  backgroundColor: color, 
                  borderColor: selectedBrushColor === color ? (theme === 'dark' ? '#ffffff' : '#000000') : 'transparent' 
                }}
              >
                {selectedBrushColor === color && (
                  <Check size={12} className={color === '#eab308' || color === '#f59e0b' ? 'text-zinc-900' : 'text-white'} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2. Annotation Mode Floating Helper Card */}
      {!studentMode && activeTool === 'annotation' && (
        <div className={cn(
          "absolute bottom-4 left-1/2 -translate-x-1/2 z-20 p-3 rounded-2xl border shadow-2xl backdrop-blur-md flex flex-col gap-1 items-center min-w-[280px] text-center transition-all duration-300 animate-fade-in",
          theme === 'dark' ? "bg-zinc-900/95 border-zinc-800 text-white" : "bg-white/95 border-zinc-200 text-zinc-800"
        )}>
          <div className="text-[9px] font-black uppercase tracking-widest text-indigo-400">
            📍 {language === 'en' ? 'ADD PIN/ARROW MODE' : language === 'ru' ? 'РЕЖИМ ДОБАВЛЕНИЯ СТРЕЛОК/НАДПИСЕЙ' : 'STRELKA VA NOM QO‘SHISH REJIMI'}
          </div>
          <p className="text-[10px] text-zinc-400 max-w-[250px] leading-snug">
            {language === 'en'
              ? 'Click anywhere on the 3D model to place an arrow and add a custom label!'
              : language === 'ru' 
                ? 'Кликните на любую точку 3D модели, чтобы установить стрелку и добавить подпись!'
                : 'Strelka va nomini o‘rnatish uchun 3D modelning istalgan joyini bosing!'}
          </p>
        </div>
      )}

      {/* 3. Collapsible Right Side Panel for Pins */}
      {!studentMode && localAnnotations.length > 0 && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: isPinsPanelOpen ? 0 : 'calc(100% - 8px)' }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          className={cn(
            "absolute right-0 top-0 bottom-0 w-60 z-20 border-l shadow-2xl backdrop-blur-md flex flex-col transition-colors duration-300",
            theme === 'dark' ? "bg-zinc-950/95 border-zinc-800 text-white" : "bg-white/95 border-zinc-200 text-zinc-800"
          )}
        >
          {/* Toggle Tab Button attached on the left of the side panel */}
          <button
            type="button"
            onClick={() => setIsPinsPanelOpen(!isPinsPanelOpen)}
            className={cn(
              "absolute left-[-24px] top-1/2 -translate-y-1/2 w-6 h-14 rounded-l-xl border-l border-y flex items-center justify-center cursor-pointer shadow-md select-none focus:outline-none transition-colors",
              theme === 'dark' 
                ? "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white" 
                : "bg-white border-zinc-200 text-zinc-500 hover:text-zinc-800"
            )}
          >
            {isPinsPanelOpen ? <ChevronRight size={12} className="stroke-[2.5]" /> : <ChevronLeft size={12} className="stroke-[2.5]" />}
          </button>

          {/* Panel Header */}
          <div className="p-3 flex flex-col gap-1 shrink-0 border-b select-none" style={{ borderColor: theme === 'dark' ? '#1f1f23' : '#e4e4e7' }}>
            <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <span>📍 {localLanguage === 'en' ? '3D PINS' : localLanguage === 'ru' ? '3D СТРЕЛКИ' : '3D STRELKALAR'} ({filteredAnnotations.length})</span>
            </div>

            {/* Unified Language Switcher */}
            <div className="flex items-center justify-between gap-1 mt-1.5">
              <span className="text-[8px] font-black uppercase text-zinc-400">
                {localLanguage === 'en' ? 'LANGUAGE:' : localLanguage === 'ru' ? 'ЯЗЫК:' : 'TIL:'}
              </span>
              
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const pinLanguages: ('uz' | 'ru' | 'en')[] = ['uz', 'ru', 'en'];
                  const currentIndex = pinLanguages.indexOf(localLanguage);
                  const nextIndex = (currentIndex + 1) % pinLanguages.length;
                  const nextLang = pinLanguages[nextIndex];
                  setLocalLanguage(nextLang);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-xl border shadow-xs transition-all active:scale-95 cursor-pointer shrink-0 select-none",
                  theme === 'dark' 
                    ? "bg-zinc-950 border-zinc-800 text-white hover:border-zinc-700" 
                    : "bg-white border-zinc-200 text-zinc-800 hover:border-zinc-300"
                )}
                title={localLanguage === 'en' ? 'Switch language' : localLanguage === 'ru' ? 'Переключить язык' : 'Tilni o‘zgartirish'}
              >
                <div className={cn(
                  "p-1 rounded-md shrink-0 flex items-center justify-center",
                  theme === 'dark' ? "bg-zinc-900 text-zinc-400" : "bg-zinc-100 text-zinc-500"
                )}>
                  <Globe size={11} className="stroke-[2.5]" />
                </div>
                
                <span className="text-[10px] font-black tracking-wider uppercase">
                  {localLanguage}
                </span>

                <div className="flex gap-0.5 items-center ml-0.5">
                  {(['uz', 'ru', 'en'] as const).map((lang) => (
                    <div 
                      key={lang} 
                      className={cn(
                        "h-1 rounded-full transition-all duration-300", 
                        lang === localLanguage 
                          ? "bg-indigo-500 dark:bg-indigo-400 w-2.5" 
                          : (theme === 'dark' ? "bg-zinc-800 w-1" : "bg-zinc-200 w-1")
                      )} 
                    />
                  ))}
                </div>
              </button>
            </div>
          </div>

          {/* List Area */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 custom-scrollbar">
            {filteredAnnotations.map((anno) => {
              const isEditing = editingAnnoId === anno.id;

              if (isEditing) {
                return (
                  <div 
                    key={anno.id} 
                    className={cn(
                      "p-2.5 rounded-xl border flex flex-col gap-2 text-[10px] font-bold",
                      theme === 'dark' ? "bg-zinc-950/90 border-zinc-800" : "bg-zinc-50 border-zinc-200"
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[8px] uppercase tracking-wider text-zinc-400">
                        {localLanguage === 'en' ? 'Edit Pin Name:' : localLanguage === 'ru' ? 'Изменить название:' : 'Nomini o‘zgartirish:'}
                      </span>
                      
                      <input 
                        type="text" 
                        value={editAnnoName}
                        onChange={(e) => setEditAnnoName(e.target.value)}
                        className={cn(
                          "px-2 py-1 text-[10px] rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full",
                          theme === 'dark' ? "bg-zinc-900 border-zinc-800 text-white" : "bg-white border-zinc-200 text-zinc-800"
                        )}
                        placeholder={localLanguage === 'en' ? 'English name' : localLanguage === 'ru' ? 'Название на русском' : 'Uzbek name'}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 mt-1">
                      <span className="text-[8px] uppercase tracking-wider text-zinc-400">
                        {localLanguage === 'en' ? 'Latin Name:' : localLanguage === 'ru' ? 'Латинское название:' : 'Lotincha nomi:'}
                      </span>
                      
                      <input 
                        type="text" 
                        value={editAnnoLa}
                        onChange={(e) => setEditAnnoLa(e.target.value)}
                        className={cn(
                          "px-2 py-1 text-[10px] rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full italic",
                          theme === 'dark' ? "bg-zinc-900 border-zinc-800 text-white" : "bg-white border-zinc-200 text-zinc-800"
                        )}
                        placeholder="e.g., Lobus frontalis"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 mt-1 pt-1.5 border-t" style={{ borderColor: theme === 'dark' ? '#27272a' : '#e4e4e7' }}>
                      <div className="flex items-center gap-1 flex-wrap">
                        {['#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#06b6d4'].map((col) => (
                          <button
                            key={col}
                            type="button"
                            onClick={() => setEditAnnoColor(col)}
                            className="w-4 h-4 rounded-full border transition-all cursor-pointer"
                            style={{ 
                              backgroundColor: col,
                              borderColor: editAnnoColor === col ? (theme === 'dark' ? '#fff' : '#000') : 'transparent'
                            }}
                          />
                        ))}
                      </div>
                      <div className="flex items-center justify-end gap-1 shrink-0">
                        <button
                          onClick={() => setEditingAnnoId(null)}
                          className={cn(
                            "p-1 rounded text-zinc-400 hover:text-zinc-600 transition-all cursor-pointer",
                            theme === 'dark' ? "hover:bg-zinc-800" : "hover:bg-zinc-200"
                          )}
                          title={language === 'en' ? 'Cancel' : language === 'ru' ? 'Отмена' : 'Bekor qilish'}
                        >
                          <X size={11} />
                        </button>
                        <button
                          onClick={() => {
                            if (editAnnoName.trim()) {
                              updateAnnotation(anno.id, editAnnoName.trim(), localLanguage, editAnnoLa.trim(), editAnnoColor);
                              setEditingAnnoId(null);
                            }
                          }}
                          className="p-1 rounded bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white transition-all cursor-pointer"
                          title={language === 'en' ? 'Save' : language === 'ru' ? 'Сохранить' : 'Saqlash'}
                        >
                          <Check size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div 
                  key={anno.id}
                  onClick={() => focusOnAnnotation(anno.position)}
                  className={cn(
                    "flex items-center justify-between gap-1.5 p-1.5 rounded-lg border text-[10px] font-bold cursor-pointer transition-all hover:translate-x-1",
                    theme === 'dark' 
                      ? "bg-zinc-950/40 border-zinc-800/65 hover:bg-zinc-850/60 text-zinc-200" 
                      : "bg-zinc-50 border-zinc-150 hover:bg-zinc-100/80 text-zinc-700"
                  )}
                  title={language === 'en' ? 'Click to focus' : language === 'ru' ? 'Кликните, чтобы сфокусироваться' : 'Fokuslash uchun bosing'}
                >
                  <div className="flex items-center gap-1.5 truncate mr-1">
                    <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: anno.color }} />
                    <span className="truncate flex flex-col items-start leading-tight">
                      <span>{anno.name || anno.nameRu || anno.nameUz || anno.nameEn}</span>
                      {anno.nameLa && <span className="text-[8px] font-normal text-indigo-400 italic leading-none">{anno.nameLa}</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => {
                        setEditingAnnoId(anno.id);
                        setEditAnnoName(anno.name || anno.nameRu || anno.nameUz || anno.nameEn || '');
                        setEditAnnoLa(anno.nameLa || '');
                        setEditAnnoColor(anno.color);
                      }}
                      className="p-1 rounded text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all cursor-pointer"
                      title={language === 'en' ? 'Rename pin' : language === 'ru' ? 'Переименовать' : 'Nomini o‘zgartirish'}
                    >
                      <Edit2 size={10} />
                    </button>
                    <button
                      onClick={() => {
                        deleteAnnotation(anno.id);
                      }}
                      className="p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-all cursor-pointer"
                      title={language === 'en' ? 'Delete pin' : language === 'ru' ? 'Удалить' : 'O‘chirish'}
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* 4. Glassmorphic Popover Modal for Creating Annotation */}
      {showAnnotationModal && pendingAnnotationPos && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-30 flex items-center justify-center p-4">
          <div className={cn(
            "w-full max-w-sm rounded-2xl border p-5 shadow-2xl flex flex-col gap-4 animate-scale-in",
            theme === 'dark' ? "bg-zinc-900 border-zinc-800 text-white" : "bg-white border-zinc-200 text-zinc-800"
          )}>
            <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: theme === 'dark' ? '#27272a' : '#e4e4e7' }}>
              <span className="text-[11px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
                📍 {language === 'en' ? 'NEW 3D PIN/ARROW' : language === 'ru' ? 'НОВАЯ 3D СТРЕЛКА/ПОДПИСЬ' : 'YANGI 3D STRELKA VA NOM'}
              </span>
              <button 
                onClick={() => {
                  setShowAnnotationModal(false);
                  setPendingAnnotationPos(null);
                }}
                className="p-1 rounded-lg hover:bg-zinc-800/10 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-indigo-400">
                  {localLanguage === 'en' ? 'Name in English' : localLanguage === 'ru' ? 'Название на русском' : 'Nomi o‘zbek tilida'}
                </label>
                <input
                  type="text"
                  placeholder={localLanguage === 'en' ? 'e.g., Frontal lobe' : localLanguage === 'ru' ? 'Например, Лобная доля' : 'Masalan, Peshona qismi'}
                  value={newAnnoName}
                  onChange={(e) => setNewAnnoName(e.target.value)}
                  className={cn(
                    "px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500",
                    theme === 'dark' ? "bg-zinc-950 border-zinc-800 text-white" : "bg-white border-zinc-200 text-zinc-800"
                  )}
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-indigo-400">
                  {localLanguage === 'en' ? 'Latin Name' : localLanguage === 'ru' ? 'Название на латыни' : 'Lotincha nomi'}
                </label>
                <input
                  type="text"
                  placeholder="e.g., Lobus frontalis"
                  value={newAnnoLa}
                  onChange={(e) => setNewAnnoLa(e.target.value)}
                  className={cn(
                    "px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500 italic",
                    theme === 'dark' ? "bg-zinc-950 border-zinc-800 text-white" : "bg-white border-zinc-200 text-zinc-800"
                  )}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400 mb-1">
                  {language === 'en' ? 'Arrow & Pin Color' : language === 'ru' ? 'Цвет стрелки и подписи' : 'Strelka va belgi rangi'}
                </label>
                <div className="flex items-center gap-1.5">
                  {['#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#06b6d4'].map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewAnnoColor(color)}
                      className="w-6.5 h-6.5 rounded-full border transition-all cursor-pointer relative"
                      style={{ 
                        backgroundColor: color,
                        borderColor: newAnnoColor === color ? (theme === 'dark' ? '#fff' : '#000') : 'transparent',
                        transform: newAnnoColor === color ? 'scale(1.1)' : 'scale(1)'
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: theme === 'dark' ? '#27272a' : '#e4e4e7' }}>
              <button
                onClick={() => {
                  setShowAnnotationModal(false);
                  setPendingAnnotationPos(null);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer",
                  theme === 'dark' ? "hover:bg-zinc-800 text-zinc-300" : "hover:bg-zinc-100 text-zinc-600"
                )}
              >
                {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
              </button>
              <button
                onClick={saveNewAnnotation}
                className="px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white transition-colors cursor-pointer"
              >
                {language === 'ru' ? 'Добавить' : 'Qo‘shish'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
