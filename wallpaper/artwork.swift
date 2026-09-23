// Draws the two pieces of artwork the release needs and the project does not ship:
// the app icon, and the background the disk image window shows behind the app and the
// Applications folder. Both use the scenes' own dark water palette.
//
//   swift artwork.swift icon <out.iconset> <out.icns>
//   swift artwork.swift background <out.png>

import AppKit

let top = NSColor(srgbRed: 0.086, green: 0.345, blue: 0.318, alpha: 1)
let bottom = NSColor(srgbRed: 0.016, green: 0.078, blue: 0.070, alpha: 1)
let foam = NSColor(srgbRed: 0.663, green: 0.949, blue: 0.878, alpha: 1)

/// The icon's fish, sized for a canvas `scale` times the 1024pt original, with the box
/// it should be drawn in.
func fish(scale: CGFloat) -> (image: NSImage, box: NSRect)? {
  guard
    let symbol = NSImage(systemSymbolName: "fish.fill", accessibilityDescription: nil)
      ?? NSImage(systemSymbolName: "fish", accessibilityDescription: nil),
    let tinted = symbol.withSymbolConfiguration(
      NSImage.SymbolConfiguration(pointSize: 430 * scale, weight: .medium)
        .applying(NSImage.SymbolConfiguration(paletteColors: [foam])))
  else { return nil }
  let size = 1024 * scale
  let box = tinted.size
  return (
    tinted,
    NSRect(
      x: (size - box.width) / 2, y: (size - box.height) / 2 - 26 * scale,
      width: box.width, height: box.height)
  )
}

func fill(_ rect: NSRect, from: NSColor, to: NSColor) {
  NSGradient(starting: from, ending: to)?.draw(in: rect, angle: -90)
}

func iconRep(size: CGFloat) -> NSBitmapImageRep {
  let s = size / 1024
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8,
    samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
    bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

  // The macOS icon grid: an 824pt body on a 1024pt canvas, corner radius 185.
  let body = NSRect(x: 100 * s, y: 100 * s, width: 824 * s, height: 824 * s)
  NSBezierPath(roundedRect: body, xRadius: 185 * s, yRadius: 185 * s).addClip()
  fill(body, from: top, to: bottom)

  // A soft light from above, the way the scenes light their own water surface.
  NSGradient(
    starting: NSColor.white.withAlphaComponent(0.16),
    ending: NSColor.white.withAlphaComponent(0)
  )?.draw(
    in: NSRect(x: body.minX, y: body.midY, width: body.width, height: body.height / 2),
    relativeCenterPosition: NSPoint(x: 0, y: 0.4))

  if let (image, box) = fish(scale: s) { image.draw(in: box) }

  // A rim keeps the body from dissolving into a dark desktop.
  NSColor.white.withAlphaComponent(0.12).setStroke()
  let rim = NSBezierPath(
    roundedRect: body.insetBy(dx: 4 * s, dy: 4 * s), xRadius: 181 * s, yRadius: 181 * s)
  rim.lineWidth = 7 * s
  rim.stroke()

  NSGraphicsContext.restoreGraphicsState()
  return rep
}

func backgroundRep() -> NSBitmapImageRep {
  let width: CGFloat = 1280, height: CGFloat = 840
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: Int(width), pixelsHigh: Int(height), bitsPerSample: 8,
    samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
    bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  fill(NSRect(x: 0, y: 0, width: width, height: height), from: top, to: bottom)

  let label = { (text: String, size: CGFloat, weight: NSFont.Weight, alpha: CGFloat, y: CGFloat) in
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    NSAttributedString(
      string: text,
      attributes: [
        .font: NSFont.systemFont(ofSize: size, weight: weight),
        .foregroundColor: NSColor.white.withAlphaComponent(alpha),
        .paragraphStyle: paragraph,
      ]
    ).draw(in: NSRect(x: 0, y: y, width: width, height: size * 1.6))
  }

  label("将 Desktop Habitats 拖入「应用程序」，然后打开它", 34, .medium, 0.92, height - 132)

  // The arrow the two icons sit either side of, at the disk image's icon row.
  let y = height / 2
  let arrow = NSBezierPath()
  arrow.move(to: NSPoint(x: 480, y: y))
  arrow.line(to: NSPoint(x: 722, y: y))
  arrow.lineWidth = 16
  arrow.lineCapStyle = .round
  arrow.stroke()
  let head = NSBezierPath()
  head.move(to: NSPoint(x: 718, y: y + 48))
  head.line(to: NSPoint(x: 800, y: y))
  head.line(to: NSPoint(x: 718, y: y - 48))
  head.close()
  head.fill()

  NSGraphicsContext.restoreGraphicsState()
  return rep
}

func write(_ rep: NSBitmapImageRep, to url: URL) {
  try? rep.representation(using: .png, properties: [:])?.write(to: url)
}

let arguments = CommandLine.arguments
let mode = arguments.count > 1 ? arguments[1] : ""

if mode == "icon", arguments.count > 3 {
  let iconset = URL(fileURLWithPath: arguments[2])
  let icns = URL(fileURLWithPath: arguments[3])
  try? FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)
  let variants: [(Int, String)] = [
    (16, "icon_16x16.png"), (32, "icon_16x16@2x.png"),
    (32, "icon_32x32.png"), (64, "icon_32x32@2x.png"),
    (128, "icon_128x128.png"), (256, "icon_128x128@2x.png"),
    (256, "icon_256x256.png"), (512, "icon_256x256@2x.png"),
    (512, "icon_512x512.png"), (1024, "icon_512x512@2x.png"),
  ]
  for (size, name) in variants {
    write(iconRep(size: CGFloat(size)), to: iconset.appendingPathComponent(name))
  }
  let iconutil = Process()
  iconutil.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
  iconutil.arguments = ["-c", "icns", iconset.path, "-o", icns.path]
  try iconutil.run()
  iconutil.waitUntilExit()
  print(iconutil.terminationStatus == 0 ? "wrote \(icns.path)" : "iconutil failed")
} else if mode == "background", arguments.count > 2 {
  write(backgroundRep(), to: URL(fileURLWithPath: arguments[2]))
  print("wrote \(arguments[2])")
} else {
  print("usage: artwork.swift icon <out.iconset> <out.icns> | background <out.png>")
  exit(1)
}
