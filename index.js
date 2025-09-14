// BUGS:
// 1. EOL space causes cursor to not move


let keystrokes = [];
let startTime = null;
let sentence = "Welcome! Each time you finish typing, your keystrokes are sent to an LLM to craft the next sentence based on your weaknesses. You must finish without errors.";

document.addEventListener("DOMContentLoaded", () => {
    const hiddenInput = document.getElementById("hiddenInput");
    const output = document.getElementById("output");
    const arrayDisplay = document.getElementById("array");

    setInterval(() => {
        if (document.activeElement !== hiddenInput) {
            hiddenInput.focus();
        }
    }, 100);

    document.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            reset()
        }
    });

    hiddenInput.addEventListener("keydown", (event) => {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
        }
        const now = performance.now()

        const isFirstKey = (keystrokes.length === 0)
        if (isFirstKey || startTime === null) {
            startTime = now;
        }

        const msSinceLastKey = (now - startTime).toFixed(0);
        keystrokes.push({
            ms: msSinceLastKey,
            key: event.key
        });
    });

    hiddenInput.addEventListener('beforeinput', (event) => {
        const PasteTypes = ['insertFromPaste', 'insertFromDrop', 'insertFromPasteAsQuotation'];
        if (PasteTypes.includes(event.inputType)) {
            event.preventDefault();
        }

        if(event.inputType != 'insertText' && event.inputType != 'deleteContentBackward'){
            keystrokes.at(-1).action = event.inputType;
        }
    });

    hiddenInput.addEventListener('input', (event) => {
        render()
        const isDone = (hiddenInput.value === sentence)
        if (isDone){
            reset()
        }
    });
    hiddenInput.addEventListener('keyup', (event) => {
        render()
        if (hiddenInput.value === "") {
            reset()
        }
    });

    reset();

    function reset() {
        console.log(JSON.stringify(keystrokes))
        keystrokes = [];
        hiddenInput.value = "";
        output.innerHTML = sentence.split('').map(c => `<span>${c}</span>`).join('') + '<span class="last">@</span>'
        output.querySelector('span').className = 'cursor'

        render()
    }

    function render() {
        const spans = output.querySelectorAll('span')
        spans.forEach((s, i) => {
            if (i + 1 == spans.length) {
                s.className = "last"
            }
            else if (i >= hiddenInput.value.length) {
                s.className = ""
            }
            else if (s.textContent === hiddenInput.value[i]) {
                s.className = "correct"
            }
            else {
                s.className = "error"
                s.setAttribute("data-pressed", hiddenInput.value[i]);
            }

            if (hiddenInput.selectionStart < hiddenInput.selectionEnd) {
                if (i >= hiddenInput.selectionStart && i < hiddenInput.selectionEnd) {
                    s.className += " selection"
                }
            } else if (i === hiddenInput.selectionStart) {
                s.className += " cursor"
            }
        })

        arrayDisplay.innerHTML = keystrokes.map(
            t => `<div><div>${t.ms}</div><div>${t.key}</div>${t.action ? `<aside>${t.action}</aside>` : ''}</div>`
        ).join('')
    }
});

