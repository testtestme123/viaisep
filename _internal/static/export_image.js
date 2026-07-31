/**
 * 图谱导出为图片的纯前端工具。
 *
 * 将 SVG 元素序列化后绘制到离屏 Canvas，生成 PNG 并触发浏览器下载。
 * 以全局命名空间 ExportImage 暴露，便于浏览器脚本与单元测试复用。
 */

(function (global) {
    "use strict";

    /**
     * 将 SVG 元素导出为 PNG 图片并触发下载。
     *
     * @param {SVGSVGElement} svg - 待导出的 SVG 元素。
     * @param {string} filenamePrefix - 文件名前缀，最终文件名为 graph-{prefix}.png。
     */
    function exportSvgAsPng(svg, filenamePrefix) {
        const serializer = new XMLSerializer();
        let svgString = serializer.serializeToString(svg);
        svgString = '<?xml version="1.0" encoding="UTF-8"?>' + svgString;

        const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        let timeoutId = null;

        function revokeUrl() {
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            URL.revokeObjectURL(url);
        }

        function detachHandlers() {
            image.onload = null;
            image.onerror = null;
        }

        function logError(message) {
            if (typeof console !== "undefined" && console.error) {
                console.error(message);
            }
        }

        const image = new Image();
        image.onload = function () {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = svg.clientWidth;
                canvas.height = svg.clientHeight;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    return;
                }

                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(image, 0, 0);

                const dataUrl = canvas.toDataURL("image/png");
                const a = document.createElement("a");
                a.download = "graph-" + filenamePrefix + ".png";
                a.href = dataUrl;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } finally {
                revokeUrl();
                detachHandlers();
            }
        };
        image.onerror = function () {
            revokeUrl();
            detachHandlers();
            logError("导出图片失败: 无法加载 SVG");
        };

        timeoutId = setTimeout(function () {
            timeoutId = null;
            detachHandlers();
            URL.revokeObjectURL(url);
            logError("导出图片失败: SVG 加载超时");
        }, 10000);

        image.src = url;
    }

    global.ExportImage = {
        exportSvgAsPng: exportSvgAsPng,
    };

    /**
     * 从 SVG 获取器导出当前图谱为 PNG。
     *
     * @param {function(): SVGSVGElement|null} svgGetter - 返回 SVG 元素的函数。
     * @param {string} [projectId="export"] - 项目 ID，用于生成文件名。
     */
    global.ExportImage.exportGraphAsImage = function (svgGetter, projectId) {
        const svg = svgGetter();
        if (!svg) {
            return;
        }
        global.ExportImage.exportSvgAsPng(svg, projectId || "export");
    };
})(typeof window !== "undefined" ? window : global);
