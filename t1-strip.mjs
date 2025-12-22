import * as exposes from "zigbee-herdsman-converters/lib/exposes";
import * as lumi from "zigbee-herdsman-converters/lib/lumi";
import * as m from "zigbee-herdsman-converters/lib/modernExtend";

const {lumiModernExtend, manufacturerCode} = lumi;
const ea = exposes.access;

// ============================================================================
// SHARED COLOR CONVERSION FUNCTIONS (identical across T1M, T1 Strip, T2)
// ============================================================================

function lumiRgbToXY(r, g, b) {
    let red = r / 255.0;
    let green = g / 255.0;
    let blue = b / 255.0;

    red = red > 0.04045 ? ((red + 0.055) / 1.055) ** 2.4 : red / 12.92;
    green = green > 0.04045 ? ((green + 0.055) / 1.055) ** 2.4 : green / 12.92;
    blue = blue > 0.04045 ? ((blue + 0.055) / 1.055) ** 2.4 : blue / 12.92;

    const X = red * 0.4124564 + green * 0.3575761 + blue * 0.1804375;
    const Y = red * 0.2126729 + green * 0.7151522 + blue * 0.0721750;
    const Z = red * 0.0193339 + green * 0.1191920 + blue * 0.9503041;

    const sum = X + Y + Z;
    if (sum === 0) {
        return {x: 0, y: 0};
    }

    return {
        x: X / sum,
        y: Y / sum,
    };
}

function lumiEncodeRgbColor(color) {
    if (typeof color !== 'object' || color.r === undefined || color.g === undefined || color.b === undefined) {
        throw new Error(`Invalid color format. Expected {r: 0-255, g: 0-255, b: 0-255}, got: ${JSON.stringify(color)}`);
    }

    const r = Number(color.r);
    const g = Number(color.g);
    const b = Number(color.b);

    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
        throw new Error(`RGB values must be between 0-255. Got r:${r}, g:${g}, b:${b}`);
    }

    const xy = lumiRgbToXY(r, g, b);

    const xScaled = Math.round(xy.x * 65535);
    const yScaled = Math.round(xy.y * 65535);

    return [
        (xScaled >>> 8) & 0xff,
        xScaled & 0xff,
        (yScaled >>> 8) & 0xff,
        yScaled & 0xff,
    ];
}

// ============================================================================
// SHARED MODERN EXTENDS (identical across T1M, T1 Strip, T2)
// ============================================================================

function lumiEffect(lookup) {
    return m.enumLookup({
        name: "effect",
        lookup: lookup,
        cluster: "manuSpecificLumi",
        attribute: {ID: 0x051f, type: 0x23},
        description: "RGB dynamic effect type",
        zigbeeCommandOptions: {manufacturerCode},
    });
}

function lumiEffectSpeed() {
    return m.numeric({
        name: "effect_speed",
        cluster: "manuSpecificLumi",
        attribute: {ID: 0x0520, type: 0x20},
        description: "RGB dynamic effect speed (1-100%)",
        zigbeeCommandOptions: {manufacturerCode},
        unit: "%",
        valueMin: 1,
        valueMax: 100,
        valueStep: 1,
    });
}

// ============================================================================
// UNIFIED SEGMENT CONTROL HELPERS (T1M and T1 Strip)
// ============================================================================

function lumiGenerateSegmentMask(segments, deviceType, maxSegments) {
    const maskSize = deviceType === "t1m" ? 4 : 8;
    const mask = new Array(maskSize).fill(0);

    for (const seg of segments) {
        if (seg < 1 || seg > maxSegments) {
            throw new Error(`Invalid segment: ${seg}. Must be 1-${maxSegments}`);
        }

        const bitPos = seg - 1;
        const byteIndex = Math.floor(bitPos / 8);
        const bitIndex = 7 - (bitPos % 8);

        mask[byteIndex] |= 1 << bitIndex;
    }

    return mask;
}

function lumiBuildSegmentPacket(segments, color, deviceType, maxSegments, brightness = 254) {
    const segmentMask = lumiGenerateSegmentMask(segments, deviceType, maxSegments);
    const colorBytes = lumiEncodeRgbColor(color);

    if (deviceType === "t1m") {
        return [...segmentMask, 0x00, 0x00, 0x00, 0x00, ...colorBytes];
    }

    const brightnessByte = Math.max(0, Math.min(254, Math.round(brightness)));
    return [0x01, 0x01, 0x01, 0x0f, brightnessByte, ...segmentMask, ...colorBytes, 0x00, 0x14];
}

// ============================================================================
// MODERN EXTEND: EFFECT COLORS
// ============================================================================

function lumiEffectColors() {
    return {
        isModernExtend: true,
        toZigbee: [
            {
                key: ["effect_colors"],
                convertSet: async (entity, key, value, meta) => {
                    const colors = value || meta.state.effect_colors || [{r: 255, g: 0, b: 0}, {r: 0, g: 255, b: 0}, {r: 0, g: 0, b: 255}];

                    if (!Array.isArray(colors) || colors.length < 1 || colors.length > 8) {
                        throw new Error("Must provide array of 1-8 RGB color objects");
                    }

                    const colorBytes = [];
                    for (const color of colors) {
                        const encoded = lumiEncodeRgbColor(color);
                        colorBytes.push(...encoded);
                    }

                    const packet = Buffer.from([0x00, colors.length, ...colorBytes]);
                    const targetEndpoint = meta.device.getEndpoint(1);

                    await targetEndpoint.write(
                        "manuSpecificLumi",
                        {1315: {value: packet, type: 0x41}},
                        {manufacturerCode, disableDefaultResponse: false},
                    );

                    return {
                        state: {
                            effect_colors: colors,
                        },
                    };
                },
            },
        ],
        exposes: [
            exposes
                .list("effect_colors", ea.SET, exposes.composite("color", "color", ea.SET)
                    .withFeature(exposes.numeric("r", ea.SET).withValueMin(0).withValueMax(255).withDescription("Red (0-255)"))
                    .withFeature(exposes.numeric("g", ea.SET).withValueMin(0).withValueMax(255).withDescription("Green (0-255)"))
                    .withFeature(exposes.numeric("b", ea.SET).withValueMin(0).withValueMax(255).withDescription("Blue (0-255)")))
                .withDescription("Array of RGB color objects for dynamic effects (1-8 colors).")
                .withLengthMin(1)
                .withLengthMax(8)
                .withCategory("config"),
        ],
    };
}

// ============================================================================
// MODERN EXTEND: SEGMENT COLORS
// ============================================================================

function lumiSegmentColors() {
    return {
        isModernExtend: true,
        toZigbee: [
            {
                key: ["segment_colors"],
                convertSet: async (entity, key, value, meta) => {
                    if (!Array.isArray(value) || value.length === 0) {
                        throw new Error("segment_colors must be a non-empty array");
                    }

                    const model = meta.device.modelID;
                    const deviceType = model === "lumi.light.acn132" ? "strip" : "t1m";
                    
                    let maxSegments;
                    if (model === "lumi.light.acn031") {
                        maxSegments = 20;
                    } else if (model === "lumi.light.acn032") {
                        maxSegments = 26;
                    } else if (model === "lumi.light.acn132") {
                        maxSegments = Math.round((meta.state.length !== undefined ? Number(meta.state.length) : 2) * 5);
                    } else {
                        maxSegments = 26;
                    }
                    
                    const brightness = meta.state && meta.state.brightness !== undefined ? Number(meta.state.brightness) : 254;

                    const colorGroups = {};

                    for (const item of value) {
                        if (!item.segment || !item.color) {
                            throw new Error(`Each segment must have "segment" (1-${maxSegments}) and "color" {r, g, b} fields`);
                        }

                        const segment = Number(item.segment);
                        const color = item.color;

                        if (segment < 1 || segment > maxSegments) {
                            throw new Error(`Invalid segment: ${segment}. Must be 1-${maxSegments}`);
                        }

                        if (typeof color !== 'object' || color.r === undefined || color.g === undefined || color.b === undefined) {
                            throw new Error(`Invalid color for segment ${segment}. Expected {r, g, b}`);
                        }

                        const colorKey = JSON.stringify({r: color.r, g: color.g, b: color.b});

                        if (!colorGroups[colorKey]) {
                            colorGroups[colorKey] = {
                                color: color,
                                segments: [],
                            };
                        }
                        colorGroups[colorKey].segments.push(segment);
                    }

                    const groups = Object.values(colorGroups);
                    const ATTR_SEGMENT_CONTROL = deviceType === "t1m" ? 1314 : 1319;

                    for (let i = 0; i < groups.length; i++) {
                        const group = groups[i];
                        const packet = lumiBuildSegmentPacket(group.segments, group.color, deviceType, maxSegments, brightness);

                        await entity.write(
                            "manuSpecificLumi",
                            {[ATTR_SEGMENT_CONTROL]: {value: Buffer.from(packet), type: 0x41}},
                            {manufacturerCode, disableDefaultResponse: false},
                        );

                        if (i < groups.length - 1) {
                            await new Promise((resolve) => setTimeout(resolve, 50));
                        }
                    }

                    if (deviceType === "strip") {
                        return {state: {segment_colors: value, state: "ON"}};
                    }
                    return {state: {segment_colors: value}};
                },
            },
        ],
        exposes: [
            exposes
                .list(
                    "segment_colors",
                    ea.SET,
                    exposes
                        .composite("segment_color", "segment_color", ea.SET)
                        .withFeature(exposes.numeric("segment", ea.SET).withDescription("Segment number"))
                        .withFeature(
                            exposes
                                .composite("color", "color", ea.SET)
                                .withFeature(exposes.numeric("r", ea.SET).withValueMin(0).withValueMax(255).withDescription("Red (0-255)"))
                                .withFeature(exposes.numeric("g", ea.SET).withValueMin(0).withValueMax(255).withDescription("Green (0-255)"))
                                .withFeature(exposes.numeric("b", ea.SET).withValueMin(0).withValueMax(255).withDescription("Blue (0-255)"))
                                .withDescription("RGB color object"),
                        ),
                )
                .withDescription("Set individual segment colors.")
                .withCategory("config"),
        ],
    };
}

// ============================================================================
// SEGMENT PATTERN PARSING
// ============================================================================

/**
 * Supported formats:
 * - Empty/"all" → all segments
 * - Comma-separated: "1,2,5,8"
 * - Ranges: "1-10", "5-15"
 * - Multiple ranges: "1-5,10-15,20-25"
 * - Mixed: "1,3,5-8,10,15-20"
 * - Patterns: "odd", "even", "first-half", "last-half", "frist-third" etc.
 * - Pattern combinations: "odd,20-25"
 */
function lumiSegmentParsePattern(value, maxSegments) {
    if (!Number.isInteger(maxSegments) || maxSegments < 1) {
        throw new Error(`Invalid maxSegments: ${maxSegments}. Must be a positive integer.`);
    }

    const trimmed = (value || "").trim().toLowerCase();
    if (trimmed === "" || trimmed === "all") {
        return Array.from({length: maxSegments}, (_, i) => i + 1);
    }

    const segments = new Set();
    const parts = trimmed.split(",").map((p) => p.trim()).filter((p) => p.length > 0);

    if (parts.length === 0) {
        return Array.from({length: maxSegments}, (_, i) => i + 1);
    }

    for (const part of parts) {
        if (lumiSegmentIsNamedPattern(part)) {
            const patternSegments = lumiSegmentExpandNamedPattern(part, maxSegments);
            for (const seg of patternSegments) {
                segments.add(seg);
            }
            continue;
        }

        if (part.includes("-")) {
            const rangeSegments = lumiSegmentExpandRange(part, maxSegments);
            for (const seg of rangeSegments) {
                segments.add(seg);
            }
            continue;
        }

        const num = lumiSegmentParseNumber(part, maxSegments);
        segments.add(num);
    }

    if (segments.size === 0) {
        throw new Error(`No valid segments found in pattern: "${value}". Valid range is 1-${maxSegments}.`);
    }

    return Array.from(segments).sort((a, b) => a - b);
}

function lumiSegmentIsNamedPattern(part) {
    const patterns = ["odd", "even", "first-half", "last-half", "first-third", "middle-third", "last-third"];
    return patterns.includes(part);
}

function lumiSegmentExpandNamedPattern(pattern, maxSegments) {
    switch (pattern) {
        case "odd":
            return Array.from({length: Math.ceil(maxSegments / 2)}, (_, i) => i * 2 + 1);
        case "even":
            return Array.from({length: Math.floor(maxSegments / 2)}, (_, i) => (i + 1) * 2).filter((n) => n <= maxSegments);
        case "first-half": {
            const count = Math.ceil(maxSegments / 2);
            return Array.from({length: count}, (_, i) => i + 1);
        }
        case "last-half": {
            const count = Math.ceil(maxSegments / 2);
            const start = maxSegments - count + 1;
            return Array.from({length: count}, (_, i) => start + i);
        }
        case "first-third": {
            const count = Math.ceil(maxSegments / 3);
            return Array.from({length: count}, (_, i) => i + 1);
        }
        case "last-third": {
            const count = Math.ceil(maxSegments / 3);
            const start = maxSegments - count + 1;
            return Array.from({length: count}, (_, i) => start + i);
        }
        case "middle-third": {
            const count = Math.ceil(maxSegments / 3);
            const start = Math.floor(maxSegments / 3) + 1;
            return Array.from({length: count}, (_, i) => start + i).filter((n) => n <= maxSegments);
        }
        default:
            throw new Error(`Unknown pattern: ${pattern}`);
    }
}

function lumiSegmentExpandRange(rangeStr, maxSegments) {
    const dashCount = (rangeStr.match(/-/g) || []).length;

    if (dashCount !== 1) {
        throw new Error(`Invalid range format: "${rangeStr}". Expected format: "start-end" (e.g., "1-10").`);
    }

    const parts = rangeStr.split("-").map((p) => p.trim());

    if (parts.length !== 2) {
        throw new Error(`Invalid range format: "${rangeStr}"`);
    }

    const start = lumiSegmentParseNumber(parts[0], maxSegments, `range start in "${rangeStr}"`);
    const end = lumiSegmentParseNumber(parts[1], maxSegments, `range end in "${rangeStr}"`);

    if (start > end) {
        throw new Error(`Invalid range: "${rangeStr}". Start (${start}) must be less than or equal to end (${end}).`);
    }

    const segments = [];
    for (let i = start; i <= end; i++) {
        segments.push(i);
    }

    return segments;
}

function lumiSegmentParseNumber(str, maxSegments, context = "segment") {
    const trimmed = str.trim();

    if (!/^[0-9]+$/.test(trimmed)) {
        throw new Error(`Invalid ${context}: "${str}". Must be a positive integer.`);
    }

    const num = Number.parseInt(trimmed, 10);

    if (Number.isNaN(num)) {
        throw new Error(`Invalid ${context}: "${str}". Could not parse as a number.`);
    }

    if (num < 1 || num > maxSegments) {
        throw new Error(`${context} out of range: ${num}. Valid range is 1-${maxSegments}.`);
    }

    return num;
}

// ============================================================================
// MODERN EXTEND: EFFECT SEGMENTS (T1 Strip)
// ============================================================================

function lumiEffectSegments() {
    return {
        isModernExtend: true,
        toZigbee: [
            {
                key: ["effect_segments"],
                convertSet: async (entity, key, value, meta) => {
                    const maxSegments = Math.round((meta.state.length !== undefined ? Number(meta.state.length) : 2) * 5);

                    const segments = lumiSegmentParsePattern(value, maxSegments);

                    const mask = Buffer.from(lumiGenerateSegmentMask(segments, "strip", maxSegments));

                    await entity.write("manuSpecificLumi", {1328: {value: mask, type: 0x41}}, {manufacturerCode, disableDefaultResponse: false});

                    return {state: {effect_segments: value}};
                },
            },
        ],
        exposes: [
            exposes
                .text("effect_segments", ea.SET)
                .withDescription(
                    "Segment selection for effects. Formats: '1,2,5' (list), '1-10' (range), " +
                    "'1-5,10-15' (multiple ranges), '1,3,5-8,10' (mixed), " +
                    "'odd/even/first-half/last-half/first-third/middle-third/last-third' (patterns). " +
                    "Empty = all segments. Each meter = 5 segments (20cm each).",
                )
                .withCategory("config"),
        ],
    };
}

const definition = {
    zigbeeModel: ["lumi.light.acn132"],
    model: "LGYCDD01LM",
    vendor: "Aqara",
    whiteLabel: [{vendor: "Aqara", model: "RLS-K01D"}],
    description: "Light strip T1",

    configure: async (device, coordinatorEndpoint) => {
        const endpoint = device.getEndpoint(1);
        await endpoint.read("manuSpecificLumi", [0x0515], {manufacturerCode: manufacturerCode});
        await endpoint.read("manuSpecificLumi", [0x0516], {manufacturerCode: manufacturerCode});
        await endpoint.read("manuSpecificLumi", [0x0517], {manufacturerCode: manufacturerCode});
        await endpoint.read("manuSpecificLumi", [0x051b], {manufacturerCode: manufacturerCode});
        await endpoint.read("manuSpecificLumi", [0x051c], {manufacturerCode: manufacturerCode});
        await endpoint.read("manuSpecificLumi", [0x051d], {manufacturerCode: manufacturerCode});
        await endpoint.read("manuSpecificLumi", [0x051e], {manufacturerCode: manufacturerCode});
        await endpoint.read("manuSpecificLumi", [0x051f], {manufacturerCode: manufacturerCode});
        await endpoint.read("manuSpecificLumi", [0x0520], {manufacturerCode: manufacturerCode});
        await endpoint.read("manuSpecificLumi", [0x0523], {manufacturerCode: manufacturerCode});
        await endpoint.read("manuSpecificLumi", [0x0527], {manufacturerCode: manufacturerCode});
        await endpoint.read("manuSpecificLumi", [0x0530], {manufacturerCode: manufacturerCode});
        await endpoint.read("genLevelCtrl", [0x0012], {});
        await endpoint.read("genLevelCtrl", [0x0013], {});
    },

    extend: [
        lumiModernExtend.lumiLight({
            colorTemp: true,
            color: {modes: ["xy"]},
            colorTempRange: [153, 370],
        }),
        m.forcePowerSource({powerSource: "Mains (single phase)"}),
        lumiModernExtend.lumiPowerOnBehavior({lookup: {on: 0, previous: 1, off: 2}}),
        lumiModernExtend.lumiZigbeeOTA(),

        lumiModernExtend.lumiDimmingRangeMin(),
        lumiModernExtend.lumiDimmingRangeMax(),
        lumiModernExtend.lumiOnOffDuration(),
        lumiModernExtend.lumiOffOnDuration(),

        m.numeric({
            name: "length",
            valueMin: 1,
            valueMax: 10,
            valueStep: 0.2,
            scale: 5,
            unit: "m",
            cluster: "manuSpecificLumi",
            attribute: {ID: 0x051b, type: 0x20},
            description: "LED strip length (5 x 20cm segments per meter), used for segment control features",
            entityCategory: "config",
            zigbeeCommandOptions: {manufacturerCode},
        }),

        m.binary({
            name: "audio",
            valueOn: ["ON", 1],
            valueOff: ["OFF", 0],
            cluster: "manuSpecificLumi",
            attribute: {ID: 0x051c, type: 0x20},
            description: "Enabling audio",
            zigbeeCommandOptions: {manufacturerCode},
        }),

        m.enumLookup({
            name: "audio_sensitivity",
            lookup: {low: 0, medium: 1, high: 2},
            cluster: "manuSpecificLumi",
            attribute: {ID: 0x051e, type: 0x20},
            description: "Audio sensitivity",
            zigbeeCommandOptions: {manufacturerCode},
        }),

        m.enumLookup({
            name: "audio_effect",
            lookup: {random: 0, blink: 1, rainbow: 2, wave: 3},
            cluster: "manuSpecificLumi",
            attribute: {ID: 0x051d, type: 0x23},
            description: "Audio effect",
            zigbeeCommandOptions: {manufacturerCode},
        }),

        lumiEffect({breathing: 0, rainbow1: 1, chasing: 2, flash: 3, hopping: 4, rainbow2: 5, flicker: 6, dash: 7}),
        lumiEffectSpeed(),
        lumiEffectSegments(),
        lumiEffectColors(),
        lumiSegmentColors(),
    ],
};

export default definition;
