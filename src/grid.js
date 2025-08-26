class Grid {
    constructor() {
        this.cells = {};
        this.cellSize = 50; // was 100; smaller size = higher density
        this.offsetX = 0;
        this.offsetY = 0;
        this.visibleCells = {};
    }

    generateCellKey(x, y) {
        return `${x},${y}`;
    }

    getCell(x, y) {
        const key = this.generateCellKey(x, y);
        if (!this.cells[key]) {
            this.cells[key] = this.createCell(x, y);
        }
        return this.cells[key];
    }

    createCell(x, y) {
        const cell = {
            x: x,
            y: y,
            content: `Cell ${x},${y}`,
            // persisted drawing state
            active: false,
            colored: false,
            bg: '',
            bc: '',
            bw: ''
        };
        return cell;
    }

    updateVisibleCells(viewportX, viewportY, width, height) {
        const startX = Math.floor(viewportX / this.cellSize);
        const startY = Math.floor(viewportY / this.cellSize);
        const endX = Math.ceil((viewportX + width) / this.cellSize);
        const endY = Math.ceil((viewportY + height) / this.cellSize);

        this.visibleCells = {};
        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                this.visibleCells[this.generateCellKey(x, y)] = this.getCell(x, y);
            }
        }
    }

    move(offsetX, offsetY) {
        this.offsetX += offsetX;
        this.offsetY += offsetY;
    }

    getVisibleCells() {
        return Object.values(this.visibleCells);
    }
}

// expose globally
window.Grid = Grid;