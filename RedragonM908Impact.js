// Redragon M908 Impact - SignalRGB Plugin
// USB protocol reverse-engineered by https://github.com/dokutan/mouse_m908
//
// This plugin includes multiple USB communication approaches selectable via
// the "Protocol Mode" dropdown. The M908 flickers with the full settings
// transaction, so lighter approaches are provided to find what works best.
//
// NOTE: Close the official Redragon software before using SignalRGB.

export function Name() { return "Redragon M908 Impact"; }
export function VendorId() { return 0x04d9; }
export function ProductId() { return 0xfc4d; }
export function Publisher() { return "Community"; }
export function Size() { return [3, 3]; }
export function Type() { return "Hid"; }
export function DefaultPosition() { return [225, 120]; }
export function DefaultScale() { return 8.0; }

export function ConflictingProcesses() {
	return ["RedragonSoftware.exe", "Redragon.exe"];
}

export function ControllableParameters() {
	return [
		{"property":"ProtocolMode", "group":"protocol", "label":"Protocol Mode",
		 "type":"combobox",
		 "values":[
			"A: Minimal Transaction",
			"B: No Transaction",
			"C: Persistent Session",
			"D: Output Report",
			"E: Single Profile Minimal",
			"F: Full Transaction (original)"
		 ],
		 "default":"A: Minimal Transaction"},
		{"property":"TargetProfile", "group":"protocol", "label":"Target Profile (1-5)",
		 "type":"number", "min":"1", "max":"5", "step":"1", "default":"1"},
		{"property":"PacketDelay", "group":"protocol", "label":"Packet Delay (ms)",
		 "type":"number", "min":"0", "max":"50", "step":"1", "default":"0"},
		{"property":"shutdownColor", "group":"lighting", "label":"Shutdown Color",
		 "min":"0", "max":"360", "type":"color", "default":"009bde"},
		{"property":"LightingMode", "group":"lighting", "label":"Lighting Mode",
		 "type":"combobox", "values":["Canvas", "Forced"], "default":"Canvas"},
		{"property":"forcedColor", "group":"lighting", "label":"Forced Color",
		 "min":"0", "max":"360", "type":"color", "default":"009bde"},
		{"property":"Brightness", "group":"lighting", "label":"Brightness",
		 "type":"combobox", "values":["Low", "Medium", "High"], "default":"High"},
	];
}

var vLedNames = ["Mouse Body"];
var vLedPositions = [[1, 1]];

export function LedNames() { return vLedNames; }
export function LedPositions() { return vLedPositions; }

// State tracking
var lastR = -1;
var lastG = -1;
var lastB = -1;
var lastBrightness = "";
var sessionOpen = false;

export function Initialize() {
	lastR = -1;
	lastG = -1;
	lastB = -1;
	lastBrightness = "";
	sessionOpen = false;

	device.log("M908 plugin loaded - Protocol: " + ProtocolMode);

	// Approach C opens the transaction once at init
	if (ProtocolMode === "C: Persistent Session") {
		sendOpen();
		sessionOpen = true;
		device.log("Persistent session opened");
	}
}

export function Render() {
	var col;

	if (LightingMode === "Forced") {
		col = hexToRgb(forcedColor);
	} else {
		col = device.color(1, 1);
	}

	var r = col[0];
	var g = col[1];
	var b = col[2];

	if (r !== lastR || g !== lastG || b !== lastB || Brightness !== lastBrightness) {
		var mode = ProtocolMode;

		if (mode === "A: Minimal Transaction") {
			approachA(r, g, b);
		} else if (mode === "B: No Transaction") {
			approachB(r, g, b);
		} else if (mode === "C: Persistent Session") {
			approachC(r, g, b);
		} else if (mode === "D: Output Report") {
			approachD(r, g, b);
		} else if (mode === "E: Single Profile Minimal") {
			approachE(r, g, b);
		} else {
			approachF(r, g, b);
		}

		lastR = r;
		lastG = g;
		lastB = b;
		lastBrightness = Brightness;
	}

	device.pause(1);
}

export function Shutdown(SystemSuspending) {
	// Close persistent session if open
	if (sessionOpen) {
		sendClose();
		sessionOpen = false;
	}

	var col;
	if (SystemSuspending) {
		col = [0, 0, 0];
	} else {
		col = hexToRgb(shutdownColor);
	}

	// Use full transaction for shutdown to ensure it sticks
	approachF(col[0], col[1], col[2]);
}

export function Validate(endpoint) {
	return endpoint.interface === 2;
}

// ============================================================
// Protocol constants
// ============================================================

var colorAddresses = [
	[0x49, 0x04], [0x51, 0x04], [0x59, 0x04],
	[0x61, 0x04], [0x69, 0x04],
];

var brightnessAddresses = [
	[0x4f, 0x04], [0x57, 0x04], [0x5f, 0x04],
	[0x67, 0x04], [0x6f, 0x04],
];

function getBrightnessValue() {
	if (Brightness === "Low") { return 0x01; }
	if (Brightness === "Medium") { return 0x02; }
	return 0x03;
}

function delay() {
	if (PacketDelay > 0) { device.pause(PacketDelay); }
}

function profileIndex() {
	return Math.max(0, Math.min(4, TargetProfile - 1));
}

// ============================================================
// Packet primitives
// ============================================================

function sendOpen() {
	device.send_report(
		[0x02, 0xf5, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 16
	);
	delay();
}

function sendClose() {
	device.send_report(
		[0x02, 0xf5, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
		 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 16
	);
	delay();
}

function sendColorPacket(profileIdx, r, g, b) {
	device.send_report([
		0x02, 0xf3, colorAddresses[profileIdx][0], colorAddresses[profileIdx][1],
		0x06, 0x00, 0x00, 0x00,
		r, g, b,
		0x01, 0x08, 0x02,
		0x00, 0x00
	], 16);
	delay();
}

function sendBrightnessPacket(profileIdx) {
	device.send_report([
		0x02, 0xf3, brightnessAddresses[profileIdx][0], brightnessAddresses[profileIdx][1],
		0x01, 0x00, 0x00, 0x00,
		getBrightnessValue(),
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	], 16);
	delay();
}

function sendColorWrite(profileIdx, r, g, b) {
	device.write([
		0x00,
		0x02, 0xf3, colorAddresses[profileIdx][0], colorAddresses[profileIdx][1],
		0x06, 0x00, 0x00, 0x00,
		r, g, b,
		0x01, 0x08, 0x02,
		0x00, 0x00
	], 17);
	delay();
}

function sendBrightnessWrite(profileIdx) {
	device.write([
		0x00,
		0x02, 0xf3, brightnessAddresses[profileIdx][0], brightnessAddresses[profileIdx][1],
		0x01, 0x00, 0x00, 0x00,
		getBrightnessValue(),
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	], 17);
	delay();
}

function sendOpenWrite() {
	device.write(
		[0x00,
		 0x02, 0xf5, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 17
	);
	delay();
}

function sendCloseWrite() {
	device.write(
		[0x00,
		 0x02, 0xf5, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
		 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 17
	);
	delay();
}

// ============================================================
// APPROACH A: Minimal Transaction
//
// Theory: Only send open + color + brightness for ONE profile + close.
// Just 4 packets instead of 16. Should reduce flicker significantly
// since the firmware spends less time in the "applying settings" state.
// ============================================================

function approachA(r, g, b) {
	var p = profileIndex();
	sendOpen();
	sendColorPacket(p, r, g, b);
	sendBrightnessPacket(p);
	sendClose();
}

// ============================================================
// APPROACH B: No Transaction
//
// Theory: Skip the open/close packets entirely. Just fire the color
// data packet directly. If the firmware applies it immediately without
// needing a transaction wrapper, this avoids the LED reset that the
// open/close causes. Fastest possible approach (1-2 packets).
// ============================================================

function approachB(r, g, b) {
	var p = profileIndex();
	sendColorPacket(p, r, g, b);
	sendBrightnessPacket(p);
}

// ============================================================
// APPROACH C: Persistent Session
//
// Theory: Open the transaction ONCE in Initialize(), send color packets
// in Render() without open/close, and close in Shutdown(). The firmware
// might keep the LEDs stable while a transaction is "in progress" and
// apply color data packets live.
// ============================================================

function approachC(r, g, b) {
	var p = profileIndex();
	sendColorPacket(p, r, g, b);
	sendBrightnessPacket(p);
}

// ============================================================
// APPROACH D: Output Report (device.write instead of device.send_report)
//
// Theory: The M908 protocol uses HID Feature Reports (control transfers),
// but maybe the device also accepts the same data as HID Output Reports
// (interrupt transfers). Some devices accept both. Output reports can
// be faster and more lightweight than feature reports.
// Uses device.write() with a leading 0x00 report ID byte.
// ============================================================

function approachD(r, g, b) {
	var p = profileIndex();
	sendOpenWrite();
	sendColorWrite(p, r, g, b);
	sendBrightnessWrite(p);
	sendCloseWrite();
}

// ============================================================
// APPROACH E: Single Profile, Color Only (no brightness packet)
//
// Theory: The absolute minimum - open, one color packet, close.
// Only 3 packets. Skips brightness entirely (uses whatever the
// mouse already has set). Tests whether brightness packet is required.
// ============================================================

function approachE(r, g, b) {
	var p = profileIndex();
	sendOpen();
	sendColorPacket(p, r, g, b);
	sendClose();
}

// ============================================================
// APPROACH F: Full Transaction (original approach)
//
// Sends all 15 settings packets + close. This is what the official
// Redragon software does. Included as reference/baseline.
// Known to cause flicker due to the firmware resetting LEDs during
// the full settings apply cycle.
// ============================================================

function approachF(r, g, b) {
	var brightnessVal = getBrightnessValue();

	sendOpen();

	// Preamble packets
	device.send_report(
		[0x02, 0xf3, 0x3e, 0x00, 0x02, 0x00, 0x00, 0x00,
		 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 16
	);
	delay();

	device.send_report(
		[0x02, 0xf3, 0x46, 0x04, 0x02, 0x00, 0x00, 0x00,
		 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 16
	);
	delay();

	// All 5 profiles
	for (var i = 0; i < 5; i++) {
		sendColorPacket(i, r, g, b);
		sendBrightnessPacket(i);
	}

	// Report rate packets
	device.send_report(
		[0x02, 0xf3, 0x32, 0x00, 0x06, 0x00, 0x00, 0x00,
		 0x02, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00, 0x00], 16
	);
	delay();

	device.send_report(
		[0x02, 0xf3, 0x38, 0x00, 0x04, 0x00, 0x00, 0x00,
		 0x02, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00], 16
	);
	delay();

	sendClose();
}

// ============================================================
// Utilities
// ============================================================

function hexToRgb(hex) {
	var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	var colors = [];
	colors[0] = parseInt(result[1], 16);
	colors[1] = parseInt(result[2], 16);
	colors[2] = parseInt(result[3], 16);
	return colors;
}
