import React from 'react';
import {
	useCurrentFrame,
	useVideoConfig,
	interpolate,
	Easing,
	AbsoluteFill,
	Sequence,
} from 'remotion';

// =============================================================================
// COMPOSITION CONFIG
// =============================================================================
export const compositionConfig = {
	id: 'BigONotation',
	durationInSeconds: 34,
	fps: 30,
	width: 1080,
	height: 1920,
};

// =============================================================================
// STYLE CONSTANTS & EASINGS
// =============================================================================
const COLORS = {
	primary: '#0A0A0F',
	secondary: '#1A1A24',
	accentBlue: '#00FFFF',
	accentRed: '#FF3366',
	accentGreen: '#10B981',
	text: '#FFFFFF',
} as const;

const TYPOGRAPHY = {
	fontFamily: 'Inter, system-ui, sans-serif',
} as const;

const EASINGS = {
	easeOut: Easing.bezier(0.33, 1, 0.68, 1),
	easeIn: Easing.bezier(0.32, 0, 0.67, 0),
	easeInOut: Easing.bezier(0.37, 0, 0.63, 1),
	overshoot: Easing.bezier(0.34, 1.56, 0.64, 1),
};

const centered: React.CSSProperties = {
	position: 'absolute',
	top: '50%',
	left: '50%',
	transform: 'translate(-50%, -50%)',
};

// =============================================================================
// UTILITIES
// =============================================================================
const seededRandom = (seed: number): number => {
	const x = Math.sin(seed * 9999) * 10000;
	return x - Math.floor(x);
};

// =============================================================================
// SHARED COMPONENTS
// =============================================================================
const CardShape: React.FC<{
	width?: number;
	height?: number;
	color?: string;
	style?: React.CSSProperties;
	children?: React.ReactNode;
}> = ({ width = 300, height = 450, color = COLORS.secondary, style, children }) => {
	return (
		<div
			style={{
				width,
				height,
				backgroundColor: color,
				borderRadius: 24,
				border: '2px solid rgba(255, 255, 255, 0.1)',
				boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
				display: 'flex',
				justifyContent: 'center',
				alignItems: 'center',
				position: 'relative', // FIXED: removed absolute positioning to allow flexbox layouts in scenes
				...style,
			}}
		>
			{children}
		</div>
	);
};

const NeonText: React.FC<{ text: string; size: number; color: string; style?: React.CSSProperties }> = ({
	text,
	size,
	color,
	style,
}) => (
	<h1
		style={{
			margin: 0,
			fontSize: size,
			fontWeight: 900,
			color: '#FFF',
			textShadow: `0 0 20px ${color}, 0 0 60px ${color}`,
			fontFamily: TYPOGRAPHY.fontFamily,
			...style,
		}}
	>
		{text}
	</h1>
);

// =============================================================================
// SCENE 1: HOOK (Exploding Deck) - 0 to 5s (150 frames)
// =============================================================================
const SceneHook: React.FC = () => {
	const frame = useCurrentFrame();

	return (
		<AbsoluteFill>
			<AbsoluteFill style={{ perspective: 1200 }}>
				{Array.from({ length: 15 }).map((_, i) => {
					const angle = seededRandom(i) * Math.PI * 2;
					const distance = seededRandom(i + 10) * 1500;
					const rotX = seededRandom(i + 20) * 360;
					const rotY = seededRandom(i + 30) * 360;
					const rotZ = seededRandom(i + 40) * 360;

					const progress = interpolate(frame, [0, 90], [0, 1], {
						easing: EASINGS.easeOut,
						extrapolateRight: 'clamp',
					});

					const scale = interpolate(frame, [0, 30], [0, 1], {
						easing: EASINGS.easeOut,
						extrapolateRight: 'clamp',
					});

					const x = Math.cos(angle) * distance * progress;
					const y = Math.sin(angle) * distance * progress;

					return (
						<div
							key={i}
							style={{
								...centered,
								transform: `translate(-50%, -50%) translate3d(${x}px, ${y}px, ${progress * 500}px) rotateX(${rotX * progress}deg) rotateY(${rotY * progress}deg) rotateZ(${rotZ * progress}deg) scale(${scale})`,
							}}
						>
							<CardShape width={150} height={225} />
						</div>
					);
				})}
			</AbsoluteFill>

			<div style={{ ...centered, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
				<h1
					style={{
						margin: 0,
						fontSize: 120,
						fontWeight: 900,
						color: COLORS.text,
						textTransform: 'uppercase',
						fontFamily: TYPOGRAPHY.fontFamily,
						transform: `scale(${interpolate(frame, [10, 40], [0.8, 1], {
							easing: EASINGS.easeOut,
							extrapolateRight: 'clamp',
							extrapolateLeft: 'clamp',
						})})`,
						opacity: interpolate(frame, [10, 30], [0, 1], { extrapolateRight: 'clamp' }),
					}}
				>
					Big O
				</h1>
				<h2
					style={{
						margin: 0,
						fontSize: 48,
						fontWeight: 700,
						color: COLORS.accentBlue,
						fontFamily: TYPOGRAPHY.fontFamily,
						letterSpacing: 4,
						opacity: interpolate(frame, [30, 50], [0, 1], { extrapolateRight: 'clamp' }),
					}}
				>
					Собеседование
				</h2>
			</div>
		</AbsoluteFill>
	);
};

// =============================================================================
// SCENE 2: O(1) CONSTANT TIME - 5 to 12s (210 frames)
// =============================================================================
const SceneConstant: React.FC = () => {
	const frame = useCurrentFrame();

	const cardY = interpolate(frame, [0, 40], [1000, 0], {
		easing: EASINGS.easeOut,
		extrapolateRight: 'clamp',
	});

	const cardRotate = interpolate(frame, [0, 40], [30, -5], {
		easing: EASINGS.easeOut,
		extrapolateRight: 'clamp',
	});

	const textScale = interpolate(frame, [30, 60], [0.5, 1], {
		easing: EASINGS.overshoot,
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	const textOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateRight: 'clamp' });

	return (
		<AbsoluteFill>
			<div
				style={{
					...centered,
					transform: `translate(-50%, calc(-50% + ${cardY}px)) rotate(${cardRotate}deg)`,
				}}
			>
				<CardShape width={400} height={600} style={{ backgroundColor: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}>
					<div
						style={{
							width: 150,
							height: 150,
							borderRadius: '50%',
							backgroundColor: COLORS.accentBlue,
							filter: 'blur(50px)',
							opacity: 0.5,
						}}
					/>
				</CardShape>
			</div>

			<div
				style={{
					...centered,
					transform: `translate(-50%, -50%) scale(${textScale})`,
					opacity: textOpacity,
				}}
			>
				<NeonText text="O(1)" size={200} color={COLORS.accentBlue} />
				<p
					style={{
						margin: '20px 0 0 0',
						fontSize: 36,
						color: '#FFF',
						fontFamily: TYPOGRAPHY.fontFamily,
						textAlign: 'center',
						opacity: 0.8,
					}}
				>
					Идеально быстро
				</p>
			</div>
		</AbsoluteFill>
	);
};

// =============================================================================
// SCENE 3: O(n) & O(n^2) - 12 to 25s (390 frames)
// =============================================================================
const SceneLinearQuadratic: React.FC = () => {
	const frame = useCurrentFrame();

	// Phase 1: Linear Scan (0 - 180)
	const cardsCount = 7;
	const scanProgress = interpolate(frame, [30, 150], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
	const laserX = interpolate(scanProgress, [0, 1], [-400, 400]);

	// Phase 2: Quadratic Chaos (180 - 390)
	const isChaos = frame > 180;
	const chaosOpacity = interpolate(frame, [180, 240], [0, 0.5], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
	const chaosScale = interpolate(frame, [180, 240], [1, 1.2], { easing: EASINGS.easeOut, extrapolateRight: 'clamp' });

	return (
		<AbsoluteFill style={{ overflow: 'hidden' }}>
			{/* Chaos Background */}
			<AbsoluteFill
				style={{
					backgroundColor: COLORS.accentRed,
					opacity: chaosOpacity,
					mixBlendMode: 'screen',
				}}
			/>

			{/* Cards Container */}
			<div
				style={{
					...centered,
					display: 'flex',
					gap: 20,
					transform: `translate(-50%, -50%) scale(${chaosScale})`,
				}}
			>
				{Array.from({ length: cardsCount }).map((_, i) => {
					// Entrance animation
					const enterY = interpolate(frame, [i * 5, 20 + i * 5], [500, 0], {
						easing: EASINGS.easeOut,
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					});

					const enterOpacity = interpolate(frame, [i * 5, 10 + i * 5], [0, 1], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					});

					// Chaos animation
					let chaosOffsetX = 0;
					let chaosOffsetY = 0;
					let chaosRot = 0;

					if (isChaos) {
						const intensity = interpolate(frame, [180, 240], [0, 30], { extrapolateRight: 'clamp' });
						chaosOffsetX = Math.sin(frame * 0.5 + i * 1.2) * intensity;
						chaosOffsetY = Math.cos(frame * 0.4 + i * 0.8) * intensity;
						chaosRot = Math.sin(frame * 0.6 + i) * (intensity * 0.5);
					}

					return (
						<div
							key={i}
							style={{
								opacity: enterOpacity,
								transform: `translate(${chaosOffsetX}px, calc(${enterY}px + ${chaosOffsetY}px)) rotate(${chaosRot}deg)`,
							}}
						>
							<CardShape width={100} height={150} color={isChaos ? '#3A0A15' : COLORS.secondary} />
						</div>
					);
				})}
			</div>

			{/* Scanner Laser */}
			{!isChaos && (
				<div
					style={{
						...centered,
						width: 10,
						height: 300,
						backgroundColor: COLORS.accentBlue,
						boxShadow: `0 0 40px 10px ${COLORS.accentBlue}`,
						transform: `translate(calc(-50% + ${laserX}px), -50%)`,
						opacity: interpolate(frame, [30, 40, 140, 150], [0, 1, 1, 0], { extrapolateRight: 'clamp' }),
					}}
				/>
			)}

			{/* Typography */}
			<div
				style={{
					position: 'absolute',
					top: '15%',
					left: 0,
					right: 0,
					display: 'flex',
					justifyContent: 'center',
				}}
			>
				{/* O(n) Text */}
				<div
					style={{
						position: 'absolute',
						opacity: interpolate(frame, [30, 50, 170, 190], [0, 1, 1, 0], { extrapolateRight: 'clamp' }),
						transform: `scale(${interpolate(frame, [30, 50], [0.5, 1], { easing: EASINGS.overshoot, extrapolateRight: 'clamp' })})`,
					}}
				>
					<NeonText text="O(n)" size={140} color={COLORS.accentBlue} />
					<p style={{ margin: 0, color: '#FFF', fontSize: 28, textAlign: 'center', opacity: 0.7, fontFamily: TYPOGRAPHY.fontFamily }}>Линейное время</p>
				</div>

				{/* O(n^2) Text */}
				<div
					style={{
						position: 'absolute',
						opacity: interpolate(frame, [190, 210], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
						transform: `scale(${interpolate(frame, [190, 220], [0.5, 1.2], { easing: EASINGS.overshoot, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})`,
					}}
				>
					<NeonText text="O(n²)" size={180} color={COLORS.accentRed} />
					<p style={{ margin: 0, color: '#FFF', fontSize: 36, textAlign: 'center', opacity: 0.9, fontFamily: TYPOGRAPHY.fontFamily, fontWeight: 'bold' }}>Худший кошмар</p>
				</div>
			</div>
		</AbsoluteFill>
	);
};

// =============================================================================
// SCENE 4: O(log n) BINARY SEARCH - 25 to 31s (180 frames)
// =============================================================================
const SceneLogarithmic: React.FC = () => {
	const frame = useCurrentFrame();

	// First Split (Frame 40)
	const split1Progress = interpolate(frame, [40, 70], [0, 1], { easing: EASINGS.easeOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
	const rightHalfOpacity = interpolate(frame, [70, 90], [1, 0], { extrapolateRight: 'clamp' });
	
	// Re-center Left Half (Frame 90)
	const recenterProgress = interpolate(frame, [90, 110], [0, 1], { easing: EASINGS.easeInOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
	
	// Second Split (Frame 120)
	const split2Progress = interpolate(frame, [120, 150], [0, 1], { easing: EASINGS.easeOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
	const rightHalf2Opacity = interpolate(frame, [150, 170], [1, 0], { extrapolateRight: 'clamp' });

	// Laser Cuts
	const laser1Y = interpolate(frame, [30, 45], [-800, 800], { extrapolateRight: 'clamp' });
	const laser2Y = interpolate(frame, [110, 125], [-800, 800], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

	return (
		<AbsoluteFill>
			<div style={{ ...centered, transform: 'translate(-50%, -40%)' }}>
				{/* Deck Wrapper */}
				<div
					style={{
						display: 'flex',
						transform: `translateX(${interpolate(recenterProgress, [0, 1], [0, 110])}px)`,
					}}
				>
					{/* Left Half (Splits again) */}
					<div
						style={{
							display: 'flex',
							transform: `translateX(${-110 * split1Progress}px)`,
						}}
					>
						{/* Left-Left Quarter */}
						<div style={{ transform: `translateX(${-55 * split2Progress}px)` }}>
							<CardShape width={100} height={300} style={{ margin: '0 5px' }} />
						</div>
						{/* Left-Right Quarter */}
						<div
							style={{
								transform: `translateX(${55 * split2Progress}px)`,
								opacity: rightHalf2Opacity,
							}}
						>
							<CardShape width={100} height={300} style={{ margin: '0 5px', backgroundColor: '#2A2A35' }} />
						</div>
					</div>

					{/* Right Half (Dusts away) */}
					<div
						style={{
							display: 'flex',
							transform: `translateX(${110 * split1Progress}px)`,
							opacity: rightHalfOpacity,
						}}
					>
						<CardShape width={100} height={300} style={{ margin: '0 5px', backgroundColor: '#2A2A35' }} />
						<CardShape width={100} height={300} style={{ margin: '0 5px', backgroundColor: '#2A2A35' }} />
					</div>
				</div>
			</div>

			{/* Lasers */}
			{frame >= 30 && frame < 60 && (
				<div
					style={{
						...centered,
						width: 4,
						height: 400,
						backgroundColor: COLORS.text,
						boxShadow: `0 0 30px 5px ${COLORS.text}`,
						transform: `translate(-50%, calc(-50% + ${laser1Y}px))`,
					}}
				/>
			)}
			{frame >= 110 && frame < 140 && (
				<div
					style={{
						...centered,
						width: 4,
						height: 400,
						backgroundColor: COLORS.text,
						boxShadow: `0 0 30px 5px ${COLORS.text}`,
						transform: `translate(-50%, calc(-50% + ${laser2Y}px))`,
					}}
				/>
			)}

			{/* Text */}
			<div
				style={{
					position: 'absolute',
					top: '15%',
					left: 0,
					right: 0,
					display: 'flex',
					justifyContent: 'center',
					opacity: interpolate(frame, [20, 40], [0, 1], { extrapolateRight: 'clamp' }),
				}}
			>
				<NeonText text="O(log n)" size={120} color={COLORS.text} />
			</div>
		</AbsoluteFill>
	);
};

// =============================================================================
// SCENE 5: OUTRO (Offer) - 31 to 34s (90 frames)
// =============================================================================
const SceneOutro: React.FC = () => {
	const frame = useCurrentFrame();

	const morphProgress = interpolate(frame, [10, 45], [0, 1], {
		easing: EASINGS.easeInOut,
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	const width = interpolate(morphProgress, [0, 1], [300, 700]);
	const height = interpolate(morphProgress, [0, 1], [450, 900]);
	const rotateY = interpolate(morphProgress, [0, 1], [0, 180]);
	const borderRadius = interpolate(morphProgress, [0, 1], [24, 12]);

	const stampScale = interpolate(frame, [50, 65], [4, 1], {
		easing: EASINGS.overshoot,
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const stampOpacity = interpolate(frame, [50, 55], [0, 1], { extrapolateRight: 'clamp' });

	return (
		<AbsoluteFill>
			<div style={{ ...centered, perspective: 1000 }}>
				<div
					style={{
						width,
						height,
						backgroundColor: morphProgress > 0.5 ? '#FFFFFF' : COLORS.secondary,
						borderRadius,
						transform: `rotateY(${rotateY}deg)`,
						display: 'flex',
						flexDirection: 'column',
						justifyContent: 'center',
						alignItems: 'center',
						boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
						overflow: 'hidden',
						position: 'relative',
					}}
				>
					{/* Document Content - Only visible after flip */}
					{morphProgress > 0.5 && (
						<div
							style={{
								transform: 'rotateY(180deg)', // Un-flip content
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								width: '100%',
								height: '100%',
								padding: 60,
								boxSizing: 'border-box',
							}}
						>
							<div style={{ width: '80%', height: 40, backgroundColor: '#E2E8F0', marginBottom: 40, borderRadius: 8 }} />
							<div style={{ width: '100%', height: 20, backgroundColor: '#F1F5F9', marginBottom: 20, borderRadius: 4 }} />
							<div style={{ width: '90%', height: 20, backgroundColor: '#F1F5F9', marginBottom: 20, borderRadius: 4 }} />
							<div style={{ width: '95%', height: 20, backgroundColor: '#F1F5F9', marginBottom: 20, borderRadius: 4 }} />
							
							<h2 style={{ fontFamily: TYPOGRAPHY.fontFamily, color: '#0F172A', fontSize: 48, marginTop: 'auto', fontWeight: 800 }}>
								JOB OFFER
							</h2>

							{/* Stamp */}
							<div
								style={{
									position: 'absolute',
									top: '50%',
									left: '50%',
									transform: `translate(-50%, -50%) scale(${stampScale}) rotate(-15deg)`,
									opacity: stampOpacity,
									border: `8px solid ${COLORS.accentGreen}`,
									color: COLORS.accentGreen,
									padding: '10px 30px',
									borderRadius: 16,
									fontSize: 64,
									fontWeight: 900,
									fontFamily: TYPOGRAPHY.fontFamily,
									letterSpacing: 4,
									textShadow: `0 0 20px rgba(16, 185, 129, 0.4)`,
									boxShadow: `inset 0 0 20px rgba(16, 185, 129, 0.2), 0 0 30px rgba(16, 185, 129, 0.4)`,
									backgroundColor: 'rgba(255,255,255,0.9)',
								}}
							>
								ACCEPTED
							</div>
						</div>
					)}
				</div>
			</div>
		</AbsoluteFill>
	);
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================
const BigONotation: React.FC = () => {
	return (
		<AbsoluteFill style={{ backgroundColor: COLORS.primary }}>
			<Sequence from={0} durationInFrames={150}>
				<SceneHook />
			</Sequence>

			<Sequence from={150} durationInFrames={210}>
				<SceneConstant />
			</Sequence>

			<Sequence from={360} durationInFrames={390}>
				<SceneLinearQuadratic />
			</Sequence>

			<Sequence from={750} durationInFrames={180}>
				<SceneLogarithmic />
			</Sequence>

			<Sequence from={930} durationInFrames={90}>
				<SceneOutro />
			</Sequence>
		</AbsoluteFill>
	);
};

export default BigONotation;