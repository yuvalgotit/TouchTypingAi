// BUGS:
// 1. EOL space causes cursor to not move in the UI (CSS problem)


let keystrokes = [];
let lastPressTime = null;
let sentence = "Welcome! Each time you finish typing"//, your keystrokes are sent to an LLM to craft the next sentence based on your weaknesses. You must finish without errors.";

document.addEventListener("DOMContentLoaded", () => {
    const hiddenInput = document.getElementById("hiddenInput");
    const output = document.getElementById("output");
    const arrayDisplay = document.getElementById("array");

    hiddenInput.focus()
    hiddenInput.addEventListener("blur", () => hiddenInput.focus())

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
        if (isFirstKey || lastPressTime === null) {
            lastPressTime = now;
        }

        keystrokes.push({
            delta: Math.round(now - lastPressTime),
            key: event.key,
        });

        lastPressTime = now
    });

    hiddenInput.addEventListener('beforeinput', (event) => {
        const PasteTypes = ['insertFromPaste', 'insertFromDrop', 'insertFromPasteAsQuotation'];
        if (PasteTypes.includes(event.inputType)) {
            event.preventDefault();
        }

        if (event.inputType != 'insertText' && event.inputType != 'deleteContentBackward' && keystrokes.length) {
            keystrokes.at(-1).action = event.inputType;
        }
    });

    hiddenInput.addEventListener('input', (event) => {
        const len = hiddenInput.value.length
        if (hiddenInput.value[len - 1] != sentence[len - 1] && keystrokes.at(-1).key != 'Backspace') {
            keystrokes.at(-1).error = true;
            keystrokes.at(-1).expected = sentence[len - 1]
        }

        render()
        const isDone = (hiddenInput.value === sentence)
        if (isDone) {
            console.log('Sentence: ' + sentence)
            console.log('Keystrokes: ' + JSON.stringify(keystrokes))
            console.log('Errors: ' + keystrokes.filter(k => k.error).length)
            console.log('WPM: ' + getWPM());

            generateNextSentence()
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
            t => `<div${t.error ? ' class="error"' : ''}
                    ><div>${t.delta}</div>
                    <div>${t.key}</div>
                    ${t.action ? `<aside>${t.action}</aside>` : ''}
                 </div>`
        ).join('')
    }

    async function generateNextSentence() {
        try {
            const res = await fetch("/generate-sentence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sentence, keystrokes })
            });
            const data = await res.json();
            console.log(data.sentence)
            sentence = data.sentence
            reset()
            render()
            return data.sentence;
        } catch (err) {
            console.error("Server error:", err);
            return sentence; // fallback
        }
    }

    function getWPM(){
        const CharsWrittenSoFar = hiddenInput.value.length;
        const totalTimeMs = keystrokes.reduce((accumulator, currentKeystroke) => {
            return accumulator + currentKeystroke.delta;
        }, 0);
        if(totalTimeMs === 0) return 0
        const minutes = totalTimeMs / 60000;
        const wpm = Math.round((CharsWrittenSoFar / 5) / minutes)

        return wpm
    }
});

