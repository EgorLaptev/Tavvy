import { DEFAULT_SETTINGS } from "./settings.js";

const shapes = [
    [70, 30, 64, 36, 35, 68, 32, 65],
    [35, 65, 30, 70, 68, 38, 62, 32],
    [65, 35, 72, 28, 30, 62, 38, 70],
    [32, 68, 55, 45, 65, 30, 70, 35],
];
const graphemeSegmenter =
    typeof Intl.Segmenter === "function"
        ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
        : null;

function graphemes(value) {
    return graphemeSegmenter
        ? Array.from(graphemeSegmenter.segment(value), (item) => item.segment)
        : Array.from(value);
}

export function markerLetters(title, count = 3) {
    const text = String(title ?? "").trim();
    const words = text.match(/[\p{L}\p{N}\p{M}]+/gu) || [];
    const letters =
        words.length === 2 && count === 3
            ? graphemes(words[0]).slice(0, 2).join("") + graphemes(words[1])[0]
            : words.length > 1
              ? words
                    .slice(0, count)
                    .map((word) => graphemes(word)[0])
                    .join("")
              : graphemes(words[0] || text)
                    .slice(0, count)
                    .join("");

    return letters.toLocaleUpperCase();
}

export function groupMarker(id) {
    let hash = 2166136261;

    for (const character of String(id))
        hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;

    const radii = shapes[hash % shapes.length];

    return {
        radii,
        rotation: hash % 90,
        borderRadius: `${radii.slice(0, 4).join("% ")}% / ${radii.slice(4).join("% ")}%`,
    };
}

export function drawMarker(
    ctx,
    id,
    color,
    size,
    style = DEFAULT_SETTINGS.markerStyle,
    title = "",
) {
    if (style === "none") return;

    if (style === "letters" || style === "letters2") {
        ctx.save();
        ctx.fillStyle = color;

        const text = markerLetters(title, style === "letters2" ? 2 : 3);
        let fontSize = size * (style === "letters2" ? 0.75 : 0.42);

        ctx.font = `600 ${fontSize}px sans-serif`;

        const width = ctx.measureText(text).width;

        if (width > size * 0.95) {
            fontSize *= (size * 0.95) / width;
            ctx.font = `600 ${fontSize}px sans-serif`;
        }

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, size / 2, size / 2);
        ctx.restore();

        return;
    }

    const shape = groupMarker(id);
    const radii =
        style === "circle"
            ? Array(8).fill(50)
            : style === "square" || style === "diamond"
              ? Array(8).fill(20)
              : shape.radii;
    const rotation =
        style === "diamond" ? 45 : style === "blob" ? shape.rotation : 0;
    const side = size * 0.72,
        origin = -side / 2;
    const r = radii.map((value) => (value / 100) * side);
    const factor = Math.min(
        1,
        side / (r[0] + r[1]),
        side / (r[3] + r[2]),
        side / (r[4] + r[7]),
        side / (r[5] + r[6]),
    );
    const [a, b, c, d, e, f, g, h] = r.map((value) => value * factor);
    const k = 0.5522847498,
        x = origin,
        y = origin,
        w = side;

    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.beginPath();
    ctx.moveTo(x + a, y);
    ctx.lineTo(x + w - b, y);
    ctx.bezierCurveTo(x + w - b + k * b, y, x + w, y + f - k * f, x + w, y + f);
    ctx.lineTo(x + w, y + w - g);
    ctx.bezierCurveTo(
        x + w,
        y + w - g + k * g,
        x + w - c + k * c,
        y + w,
        x + w - c,
        y + w,
    );
    ctx.lineTo(x + d, y + w);
    ctx.bezierCurveTo(x + d - k * d, y + w, x, y + w - h + k * h, x, y + w - h);
    ctx.lineTo(x, y + e);
    ctx.bezierCurveTo(x, y + e - k * e, x + a - k * a, y, x + a, y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "rgba(160,160,160,.45)";
    ctx.lineWidth = size / 32;
    ctx.stroke();
    ctx.restore();
}
