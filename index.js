let keystrokes = [];
let startTime = null;
let sentence = "maybe input array should be based on the input. but than we will miss stuff like shift and capslock (is this the only downside?)"

document.addEventListener("DOMContentLoaded", () => {
    const hiddenInput = document.getElementById("hiddenInput");
    const output = document.getElementById("output");

    setInterval(() => {
        if (document.activeElement !== hiddenInput) {
            hiddenInput.focus();
        }
    }, 100);

    document.addEventListener("keydown", (event) => {
        const now = performance.now();

        if (keystrokes.length === 0) {
            startTime = performance.now();
        }

        if (event.key === "Enter") {
            reset()
        } else {
            if (startTime === null) {
                startTime = now;
            }
            const msSinceLastKey = (now - startTime).toFixed(0);
            keystrokes.push([event.key, msSinceLastKey]);
        }
    });

    hiddenInput.addEventListener('input', (event) => {
        console.log(event);
        output.querySelectorAll('span').forEach((s, i) => {
            if (i > hiddenInput.value.length) {
                s.className = ""
            }
            else if (i === hiddenInput.value.length) {
                s.className = "cursor"
            }
            else if (s.textContent === hiddenInput.value[i]) {
                s.className = "correct"
            }
            else {
                s.className = "error"
            }
        })
    });

    reset();

    function reset() {
        console.log(keystrokes)
        keystrokes = [];
        hiddenInput.value = "";
        output.innerHTML = sentence.split('').map(c => `<span>${c}</span>`).join('')
        output.querySelector('span').className = 'cursor'
    }
});

