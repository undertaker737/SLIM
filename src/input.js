(function () {
    function initInput(onMove, step = 100, onZoom = null, getStep = null) {
        function currentStep() {
            return typeof getStep === 'function' ? getStep() : step;
        }

        function handleKeyPress(event) {
            const key = (event.key || '').toLowerCase();

            // let Shift+ shortcuts pass through to tools
            if (event.shiftKey) return;

            switch (key) {
                case 'arrowup':
                case 'w':
                    onMove(0, -currentStep());
                    break;
                case 'arrowdown':
                case 's':
                    onMove(0, currentStep());
                    break;
                case 'arrowleft':
                case 'a':
                    onMove(-currentStep(), 0);
                    break;
                case 'arrowright':
                case 'd':
                    onMove(currentStep(), 0);
                    break;
                case 'q': // zoom out
                    if (typeof onZoom === 'function') onZoom('out');
                    break;
                case 'e': // zoom in
                    if (typeof onZoom === 'function') onZoom('in');
                    break;
                default:
                    return;
            }
            event.preventDefault();
        }

        window.addEventListener('keydown', handleKeyPress);
    }

    // expose globally
    window.initInput = initInput;
})();