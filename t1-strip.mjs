import * as exposes from "zigbee-herdsman-converters/lib/exposes";
import * as lumi from "zigbee-herdsman-converters/lib/lumi";
import * as m from "zigbee-herdsman-converters/lib/modernExtend";

const {lumiModernExtend, manufacturerCode} = lumi;
const ea = exposes.access;

// Convert RGB to XY
function rgbToXY(r, g, b) {
    // Normalize RGB to 0-1
    let red = r / 255.0;
    let green = g / 255.0;
    let blue = b / 255.0;

    // Apply gamma correction (sRGB)
    red = red > 0.04045 ? ((red + 0.055) / 1.055) ** 2.4 : red / 12.92;
    green = green > 0.04045 ? ((green + 0.055) / 1.055) ** 2.4 : green / 12.92;
    blue = blue > 0.04045 ? ((blue + 0.055) / 1.055) ** 2.4 : blue / 12.92;

    // Convert to XYZ using sRGB D65 conversion matrix
    const X = red * 0.4124564 + green * 0.3575761 + blue * 0.1804375;
    const Y = red * 0.2126729 + green * 0.7151522 + blue * 0.072175;
    const Z = red * 0.0193339 + green * 0.119192 + blue * 0.9503041;

    const sum = X + Y + Z;
    if (sum === 0) {
        return {x: 0, y: 0};
    }

    return {
        x: X / sum,
        y: Y / sum,
    };
}

function encodeColor(hexColor) {
    const normalized = hexColor.toUpperCase().replace("#", "");
    if (!/^[0-9A-F]{6}$/.test(normalized)) {
        throw new Error(`Invalid color format: ${hexColor}. Use format #RRGGBB (e.g., #FF0000)`);
    }

    const r = Number.parseInt(normalized.substr(0, 2), 16);
    const g = Number.parseInt(normalized.substr(2, 2), 16);
    const b = Number.parseInt(normalized.substr(4, 2), 16);

    // Convert RGB to XY
    const xy = rgbToXY(r, g, b);

    // Scale to 16-bit integers
    const xScaled = Math.round(xy.x * 65535);
    const yScaled = Math.round(xy.y * 65535);

    // Pack into 4 bytes (big endian): [x_high, x_low, y_high, y_low]
    return [
        (xScaled >>> 8) & 0xff, // x_high
        xScaled & 0xff, // x_low
        (yScaled >>> 8) & 0xff, // y_high
        yScaled & 0xff, // y_low
    ];
}

function getStateKey(meta) {
    // Check if device has multiple endpoints
    // This works for T1M which has endpoints: {white: 1, rgb: 2}
    // T1 Strip has single endpoint, so this returns 'state'
    const rgbEndpoint = meta.device.getEndpoint(2);
    if (rgbEndpoint) {
        const endpoints = meta.device.endpoints;
        if (endpoints && endpoints.length > 1) {
            // Multi-endpoint device, use state_rgb
            return "state_rgb";
        }
    }
    return "state";
}

// T1 STRIP SPECIFIC: SEGMENT CONTROL
function calculateSegmentCount(lengthMeters) {
    return Math.round(lengthMeters * 5);
}

function generateSegmentMask(segments, maxSegments) {
    const mask = [0, 0, 0, 0, 0, 0, 0, 0];

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

// Build packet for T1 Strip segment control
function buildSegmentPacket(segments, hexColor, brightness, maxSegments) {
    const segmentMask = generateSegmentMask(segments, maxSegments);
    const colorBytes = encodeColor(hexColor);
    const brightnessByte = Math.max(0, Math.min(255, Math.round(brightness)));

    // Packet structure for static segment colors:
    // [0-3]:   Fixed header (01:01:01:0f)
    // [4]:     Brightness (0-255)
    // [5-12]:  Segment bitmask (8 bytes)
    // [13-16]: Color (XY, 4 bytes)
    // [17-18]: Footer (00:14)
    return [0x01, 0x01, 0x01, 0x0f, brightnessByte, ...segmentMask, ...colorBytes, 0x00, 0x14];
}

const definition = {
    zigbeeModel: ["lumi.light.acn132"],
    model: "LGYCDD01LM",
    vendor: "Aqara",
    whiteLabel: [{vendor: "Aqara", model: "RLS-K01D"}],
    description: "Light strip T1",

    configure: async (device, coordinatorEndpoint) => {
        const endpoint = device.getEndpoint(1);
        await endpoint.read("manuSpecificLumi", [0x0515], {manufacturerCode}); // dimming_range_minimum
        await endpoint.read("manuSpecificLumi", [0x0516], {manufacturerCode}); // dimming_range_maximum
    },

    extend: [
        m.light({
            effect: false,
            powerOnBehavior: false,
            colorTemp: {startup: false, range: [153, 370]},
            color: true,
        }),
        lumiModernExtend.lumiPowerOnBehavior(),
        m.forcePowerSource({powerSource: "Mains (single phase)"}),
        lumiModernExtend.lumiZigbeeOTA(),

        m.numeric({
            name: "length",
            valueMin: 1,
            valueMax: 10,
            valueStep: 0.2,
            scale: 5,
            unit: "m",
            cluster: "manuSpecificLumi",
            attribute: {ID: 0x051b, type: 0x20},
            description: "LED strip length (5 segments per meter)",
            zigbeeCommandOptions: {manufacturerCode},
        }),

        m.numeric({
            name: "min_brightness",
            valueMin: 0,
            valueMax: 99,
            unit: "%",
            cluster: "manuSpecificLumi",
            attribute: {ID: 0x0515, type: 0x20},
            description: "Minimum brightness level",
            zigbeeCommandOptions: {manufacturerCode},
        }),

        m.numeric({
            name: "max_brightness",
            valueMin: 1,
            valueMax: 100,
            unit: "%",
            cluster: "manuSpecificLumi",
            attribute: {ID: 0x0516, type: 0x20},
            description: "Maximum brightness level",
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

        m.numeric({
            name: "preset",
            valueMin: 1,
            valueMax: 32,
            cluster: "manuSpecificLumi",
            attribute: {ID: 0x051f, type: 0x23},
            description: "Preset index (0-6 default presets, 7-32 custom)",
            zigbeeCommandOptions: {manufacturerCode},
        }),

        m.numeric({
            name: "off_on_duration",
            label: "Off to On dimming duration",
            cluster: "genLevelCtrl",
            attribute: {ID: 0x0012, type: 0x21},
            description: "The light will gradually brighten according to the set duration",
            entityCategory: "config",
            unit: "s",
            valueMin: 0,
            valueMax: 10,
            valueStep: 0.5,
            scale: 10,
        }),

        m.numeric({
            name: "on_off_duration",
            label: "On to Off dimming duration",
            cluster: "genLevelCtrl",
            attribute: {ID: 0x0013, type: 0x21},
            description: "The light will gradually dim according to the set duration",
            entityCategory: "config",
            unit: "s",
            valueMin: 0,
            valueMax: 10,
            valueStep: 0.5,
            scale: 10,
        }),

        m.numeric({
            name: "dimming_range_minimum",
            label: "Dimming Range Minimum",
            cluster: "manuSpecificLumi",
            attribute: {ID: 0x0515, type: 0x20},
            description: "Minimum Allowed Dimming Value",
            entityCategory: "config",
            zigbeeCommandOptions: {manufacturerCode},
            unit: "%",
            valueMin: 1,
            valueMax: 100,
            valueStep: 1,
        }),

        m.numeric({
            name: "dimming_range_maximum",
            label: "Dimming Range Maximum",
            cluster: "manuSpecificLumi",
            attribute: {ID: 0x0516, type: 0x20},
            description: "Maximum Allowed Dimming Value",
            entityCategory: "config",
            zigbeeCommandOptions: {manufacturerCode},
            unit: "%",
            valueMin: 1,
            valueMax: 100,
            valueStep: 1,
        }),

        // RGB Effect Type - T1 Strip specific mappings
        m.enumLookup({
            name: "rgb_effect",
            lookup: {breathing: 0, rainbow1: 1, chasing: 2, flash: 3, hopping: 4, rainbow2: 5, flicker: 6, dash: 7},
            cluster: "manuSpecificLumi",
            attribute: {ID: 0x051f, type: 0x23},
            description: "RGB dynamic effect type",
            zigbeeCommandOptions: {manufacturerCode},
        }),

        // RGB Effect Speed
        m.numeric({
            name: "speed",
            cluster: "manuSpecificLumi",
            attribute: {ID: 0x0520, type: 0x20},
            description: "RGB dynamic effect speed (1-100%)",
            zigbeeCommandOptions: {manufacturerCode},
            unit: "%",
            valueMin: 1,
            valueMax: 100,
            valueStep: 1,
        }),
    ],

    exposes: [
        // Segment control
        exposes
            .list(
                "segment_colors",
                ea.SET,
                exposes
                    .composite("segment_color", "segment_color", ea.SET)
                    .withFeature(exposes.numeric("segment", ea.SET).withDescription("Segment number (1-based, max depends on strip length)"))
                    .withFeature(exposes.text("color", ea.SET).withDescription("Hex color (e.g., #FF0000)")),
            )
            .withDescription("Set individual segment colors"),

        // Segment brightness control - percentage based (applies to all segments)
        exposes
            .numeric("segment_brightness", ea.SET)
            .withValueMin(1)
            .withValueMax(100)
            .withValueStep(1)
            .withUnit("%")
            .withDescription("Brightness for segments (1-100%)")
            .withCategory("config"),

        // RGB dynamic effect parameters (effect type and speed handled by modernExtend)
        exposes
            .text("rgb_effect_colors", ea.SET)
            .withDescription("Comma-separated RGB hex colors (e.g., #FF0000,#00FF00,#0000FF). 1-8 colors")
            .withCategory("config"),
        exposes
            .numeric("rgb_effect_brightness", ea.SET)
            .withValueMin(1)
            .withValueMax(100)
            .withValueStep(1)
            .withUnit("%")
            .withDescription("RGB dynamic effect brightness (1-100%)")
            .withCategory("config"),

        // Segment activation control for dymanic effects
        exposes
            .text("active_segments", ea.SET)
            .withDescription(
                "Comma-separated segment numbers to activate for dynamic effects (e.g., '1,2,5,8'). Leave empty or unset for all segments.",
            )
            .withCategory("config"),
    ],

    toZigbee: [
        {
            key: ["segment_colors", "segment_brightness"],
            convertSet: async (entity, key, value, meta) => {
                // Handle brightness setting
                if (key === "segment_brightness") {
                    if (value < 1 || value > 100) {
                        throw new Error(`Invalid brightness: ${value}. Must be 1-100%`);
                    }
                    return {state: {segment_brightness: value}};
                }

                // Segment colors
                if (!Array.isArray(value) || value.length === 0) {
                    throw new Error("segment_colors must be a non-empty array");
                }

                const stripLength = meta.state.length || 2;
                const maxSegments = calculateSegmentCount(stripLength);

                // Brightness from state or use default (100%)
                const brightnessPercent = meta.state.segment_brightness !== undefined ? meta.state.segment_brightness : 100;

                // Convert percentage (1-100) to hardware value (0-255)
                const brightness = Math.round((brightnessPercent / 100) * 255);

                // Turn on light if off
                if (meta.state.state === "OFF") {
                    await entity.command("genOnOff", "on", {}, {});
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }

                // Group segments by color for efficiency
                const colorGroups = {};
                for (const item of value) {
                    if (!item.segment || !item.color) {
                        throw new Error('Each segment must have "segment" and "color" fields');
                    }

                    const segment = item.segment;
                    const color = item.color.toUpperCase();

                    if (segment < 1 || segment > maxSegments) {
                        throw new Error(`Invalid segment: ${segment}. Must be 1-${maxSegments}`);
                    }

                    if (!colorGroups[color]) {
                        colorGroups[color] = {
                            color: color,
                            segments: [],
                        };
                    }
                    colorGroups[color].segments.push(segment);
                }

                // Send one packet per color group
                const groups = Object.values(colorGroups);
                const ATTR_SEGMENT_CONTROL = 0x0527;

                for (let i = 0; i < groups.length; i++) {
                    const group = groups[i];
                    const packet = buildSegmentPacket(group.segments, group.color, brightness, maxSegments);

                    await entity.write(
                        "manuSpecificLumi",
                        {[ATTR_SEGMENT_CONTROL]: {value: Buffer.from(packet), type: 0x41}},
                        {manufacturerCode, disableDefaultResponse: false},
                    );

                    if (i < groups.length - 1) {
                        await new Promise((resolve) => setTimeout(resolve, 50));
                    }
                }

                // Determine correct state key based on device endpoint configuration
                const stateKey = getStateKey(meta);

                return {state: {segment_colors: value, [stateKey]: "ON"}};
            },
        },
        {
            key: ["rgb_effect_colors", "rgb_effect_brightness"],
            convertSet: async (entity, key, value, meta) => {
                // Read from incoming message first (allows single MQTT payload with all params),
                // then fall back to state, then to defaults
                const colors = meta.message.rgb_effect_colors || meta.state.rgb_effect_colors || "#FF0000,#00FF00,#0000FF";
                const brightnessPercent = meta.message.rgb_effect_brightness ?? meta.state.rgb_effect_brightness ?? 100;

                // Parse colors
                const colorList = colors.split(",").map((c) => c.trim());

                if (colorList.length < 1 || colorList.length > 8) {
                    throw new Error("Must provide 1-8 colors");
                }

                if (brightnessPercent < 1 || brightnessPercent > 100) {
                    throw new Error("Brightness must be between 1 and 100%");
                }

                // Convert brightness percentage to 8-bit value (0-254)
                const brightness8bit = Math.round((brightnessPercent / 100) * 254);

                // Encode all colors for the color message
                const colorBytes = [];
                for (const color of colorList) {
                    const encoded = encodeColor(color);
                    colorBytes.push(...encoded);
                }

                // Build color message (0x03 prefix) - sent to 0x0527
                const msg1Length = 3 + colorList.length * 4;
                const msg1 = Buffer.from([0x01, 0x01, 0x03, msg1Length, brightness8bit, 0x00, colorList.length, ...colorBytes]);

                const ATTR_RGB_COLORS = 0x0527;

                // Turn on the light first
                await entity.command("genOnOff", "on", {}, {});

                // Send colors to 0x0527
                await entity.write(
                    "manuSpecificLumi",
                    {[ATTR_RGB_COLORS]: {value: msg1, type: 0x41}},
                    {manufacturerCode, disableDefaultResponse: false},
                );

                // Determine correct state key based on device endpoint configuration
                const stateKey = getStateKey(meta);

                return {
                    state: {
                        rgb_effect_colors: colors,
                        rgb_effect_brightness: brightnessPercent,
                        [stateKey]: "ON",
                    },
                };
            },
        },
        {
            key: ["active_segments"],
            convertSet: async (entity, key, value, meta) => {
                const stripLength = meta.state.length || 2;
                const maxSegments = calculateSegmentCount(stripLength);

                let segments;
                if (!value || value.trim() === "") {
                    // Empty or unset: use all segments
                    segments = Array.from({length: maxSegments}, (_, i) => i + 1);
                } else {
                    // Parse comma-separated segment numbers
                    segments = value
                        .split(",")
                        .map((s) => Number.parseInt(s.trim(), 10))
                        .filter((n) => !Number.isNaN(n) && n >= 1 && n <= maxSegments);

                    if (segments.length === 0) {
                        throw new Error(`Invalid segment numbers. Must be 1-${maxSegments}`);
                    }
                }

                const mask = Buffer.from(generateSegmentMask(segments, maxSegments));

                await entity.write("manuSpecificLumi", {[0x0530]: {value: mask, type: 0x41}}, {manufacturerCode, disableDefaultResponse: false});

                return {state: {active_segments: value}};
            },
        },
        {
            key: ["dimming_range_minimum", "dimming_range_maximum"],
            convertSet: async (entity, key, value, meta) => {
                // Validate that min doesn't exceed max
                const newMin = key === "dimming_range_minimum" ? value : meta.state.dimming_range_minimum;
                const newMax = key === "dimming_range_maximum" ? value : meta.state.dimming_range_maximum;

                if (newMin !== undefined && newMax !== undefined && newMin > newMax) {
                    throw new Error(`Minimum (${newMin}%) cannot exceed maximum (${newMax}%)`);
                }

                const attrId = key === "dimming_range_minimum" ? 0x0515 : 0x0516;
                await entity.write("manuSpecificLumi", {[attrId]: {value, type: 0x20}}, {manufacturerCode});

                return {state: {[key]: value}};
            },
        },
    ],
};

export default definition;
