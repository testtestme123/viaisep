/**
 * @jest-environment jsdom
 */

const path = require("path");
require(path.join(__dirname, "..", "export_image.js"));

describe("ExportImage.exportSvgAsPng", () => {
    let mockContext;
    let mockCanvas;
    let mockAnchor;
    let imageInstances;

    beforeEach(() => {
        imageInstances = [];

        global.XMLSerializer = jest.fn().mockImplementation(() => ({
            serializeToString: jest
                .fn()
                .mockReturnValue('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        }));

        global.Blob = jest.fn().mockImplementation((parts, options) => ({
            parts,
            options,
        }));

        global.URL.createObjectURL = jest.fn().mockReturnValue("blob:test-url");
        global.URL.revokeObjectURL = jest.fn();

        mockContext = {
            fillStyle: "",
            fillRect: jest.fn(),
            drawImage: jest.fn(),
        };

        mockCanvas = {
            width: 0,
            height: 0,
            getContext: jest.fn().mockReturnValue(mockContext),
            toDataURL: jest.fn().mockReturnValue("data:image/png;base64,testdata"),
        };

        mockAnchor = {
            download: "",
            href: "",
            click: jest.fn(),
        };

        document.createElement = jest.fn((tag) => {
            if (tag === "canvas") {
                return mockCanvas;
            }
            if (tag === "a") {
                return mockAnchor;
            }
            return {};
        });
        document.body.appendChild = jest.fn();
        document.body.removeChild = jest.fn();

        global.Image = jest.fn().mockImplementation(function () {
            imageInstances.push(this);
            this._src = "";
        });
        Object.defineProperty(global.Image.prototype, "src", {
            set(value) {
                this._src = value;
            },
            get() {
                return this._src;
            },
        });
    });

    test("exports SVG as PNG with white background and triggers download", () => {
        const svg = { clientWidth: 800, clientHeight: 600 };
        ExportImage.exportSvgAsPng(svg, "demo");

        const image = imageInstances[imageInstances.length - 1];
        image.onload();

        expect(global.XMLSerializer).toHaveBeenCalled();
        expect(global.URL.createObjectURL).toHaveBeenCalled();
        expect(document.createElement).toHaveBeenCalledWith("canvas");
        expect(mockCanvas.width).toBe(800);
        expect(mockCanvas.height).toBe(600);
        expect(mockContext.fillStyle).toBe("#ffffff");
        expect(mockContext.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
        expect(mockContext.drawImage).toHaveBeenCalled();
        expect(mockAnchor.download).toBe("graph-demo.png");
        expect(mockAnchor.href).toBe("data:image/png;base64,testdata");
        expect(mockAnchor.click).toHaveBeenCalled();
        expect(document.body.appendChild).toHaveBeenCalledWith(mockAnchor);
        expect(document.body.removeChild).toHaveBeenCalledWith(mockAnchor);
        expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-url");
    });

    test("does nothing when canvas context is unavailable", () => {
        mockCanvas.getContext.mockReturnValue(null);
        const svg = { clientWidth: 400, clientHeight: 300 };
        ExportImage.exportSvgAsPng(svg, "nocanvas");

        const image = imageInstances[imageInstances.length - 1];
        image.onload();

        expect(document.createElement).toHaveBeenCalledWith("canvas");
        expect(mockAnchor.click).not.toHaveBeenCalled();
        expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-url");
    });

    test("revokes blob URL if image load hangs", () => {
        jest.useFakeTimers();
        const consoleSpy = jest.spyOn(console, "error").mockImplementation();
        const svg = { clientWidth: 100, clientHeight: 100 };
        ExportImage.exportSvgAsPng(svg, "hang");

        jest.runAllTimers();

        expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-url");
        expect(consoleSpy).toHaveBeenCalledWith("导出图片失败: SVG 加载超时");
        consoleSpy.mockRestore();
        jest.useRealTimers();
    });
});

describe("ExportImage.exportGraphAsImage", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("calls exportSvgAsPng when SVG is returned", () => {
        const svg = { clientWidth: 100, clientHeight: 100 };
        const svgGetter = jest.fn().mockReturnValue(svg);
        const exportSvgAsPngSpy = jest.spyOn(ExportImage, "exportSvgAsPng");

        ExportImage.exportGraphAsImage(svgGetter, "myproject");

        expect(svgGetter).toHaveBeenCalled();
        expect(exportSvgAsPngSpy).toHaveBeenCalledWith(svg, "myproject");
    });

    test("uses fallback prefix when project ID is empty", () => {
        const svg = { clientWidth: 100, clientHeight: 100 };
        const svgGetter = jest.fn().mockReturnValue(svg);
        const exportSvgAsPngSpy = jest.spyOn(ExportImage, "exportSvgAsPng");

        ExportImage.exportGraphAsImage(svgGetter, "");

        expect(exportSvgAsPngSpy).toHaveBeenCalledWith(svg, "export");
    });

    test("does nothing when SVG getter returns null", () => {
        const svgGetter = jest.fn().mockReturnValue(null);
        const exportSvgAsPngSpy = jest.spyOn(ExportImage, "exportSvgAsPng");

        ExportImage.exportGraphAsImage(svgGetter, "myproject");

        expect(svgGetter).toHaveBeenCalled();
        expect(exportSvgAsPngSpy).not.toHaveBeenCalled();
    });
});
