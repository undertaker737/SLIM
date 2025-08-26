function render(grid) {
    const gridContainer = document.getElementById('grid-container');
    if (!gridContainer) return;

    const width = gridContainer.clientWidth || window.innerWidth;
    const height = gridContainer.clientHeight || window.innerHeight;

    grid.updateVisibleCells(grid.offsetX, grid.offsetY, width, height);

    gridContainer.innerHTML = ''; // Clear previous grid cells
    const visibleCells = grid.getVisibleCells();

    visibleCells.forEach(cell => {
        const cellElement = document.createElement('div');
        cellElement.className = 'grid-cell';
        cellElement.style.left = `${cell.x * grid.cellSize - grid.offsetX}px`;
        cellElement.style.top = `${cell.y * grid.cellSize - grid.offsetY}px`;
        // dynamically size cells to match zoom
        cellElement.style.width = `${grid.cellSize}px`;
        cellElement.style.height = `${grid.cellSize}px`;
        // add grid indices for tools
        cellElement.dataset.x = cell.x;
        cellElement.dataset.y = cell.y;

        // apply persisted state
        if (cell.active) cellElement.classList.add('active');
        if (cell.colored) cellElement.classList.add('colored');
        if (cell.bg) cellElement.style.backgroundColor = cell.bg;
        if (cell.bc) cellElement.style.borderColor = cell.bc;
        if (cell.bw) cellElement.style.borderWidth = cell.bw;

        gridContainer.appendChild(cellElement);
    });
}

// expose globally
window.render = render;