export function compensateAnchorChange(
	rotation: number,
	scale: readonly [number, number],
	translation: readonly [number, number],
	oldAnchor: readonly [number, number],
	newAnchor: readonly [number, number],
): [number, number] {
	const values = [rotation, ...scale, ...translation, ...oldAnchor, ...newAnchor];
	if (!values.every(Number.isFinite)) throw new Error('Anchor transform values must be finite.');

	const deltaX = newAnchor[0] - oldAnchor[0];
	const deltaY = newAnchor[1] - oldAnchor[1];
	const radians = (rotation * Math.PI) / 180;
	const cosine = Math.cos(radians);
	const sine = Math.sin(radians);

	// Match the production editor's shared computeAnchorDelta(): rotation * scale.
	const scaledX = deltaX * scale[0];
	const scaledY = deltaY * scale[1];
	const movedX = scaledX * cosine - scaledY * sine;
	const movedY = scaledX * sine + scaledY * cosine;
	return [translation[0] + movedX - deltaX, translation[1] + movedY - deltaY];
}
