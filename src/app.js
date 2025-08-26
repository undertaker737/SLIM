(function () {
    const grid = new Grid();
    // make grid available to tools
    window.appGrid = grid;

    function setup() {
        window.addEventListener('resize', () => render(grid));

        const onMove = (dx, dy) => {
            grid.move(dx, dy);
            render(grid);
        };

        const onZoom = (dir) => {
            const factor = dir === 'in' ? 1.25 : 0.8;
            const minSize = 20;
            const maxSize = 200;
            const next = Math.round(grid.cellSize * factor);
            grid.cellSize = Math.max(minSize, Math.min(maxSize, next));
            render(grid);
        };

        const getStep = () => Math.max(10, Math.round(grid.cellSize / 2));

        initInput(onMove, grid.cellSize / 2, onZoom, getStep);

        render(grid);
    }

    setup();
})();