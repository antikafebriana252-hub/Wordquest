// Game Logic
class SoundManager {
    constructor() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.enabled = true;
    }

    playTone(freq, type, duration) {
        if (!this.enabled) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + duration);
    }

    playSuccess() {
        this.playTone(600, 'sine', 0.1);
        setTimeout(() => this.playTone(800, 'sine', 0.2), 100);
    }

    playError() {
        this.playTone(200, 'sawtooth', 0.3);
    }

    playClick() {
        this.playTone(400, 'triangle', 0.05);
    }

    playWin() {
        this.playTone(500, 'square', 0.1);
        setTimeout(() => this.playTone(600, 'square', 0.1), 100);
        setTimeout(() => this.playTone(700, 'square', 0.1), 200);
        setTimeout(() => this.playTone(800, 'square', 0.4), 300);
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
}

class Game {
    constructor() {
        this.state = {
            level: null,
            wordIndex: 0,
            currentWord: "",
            inputBuffer: "", // Stores user typing
            score: 0,
            coins: 0,
            timer: 0,
            combo: 0
        };

        this.timerInterval = null;
        this.audio = new SoundManager();

        // DOM Elements - Helper
        this.dom = (id) => document.getElementById(id);
        this.screens = {
            start: this.dom('start-screen'),
            level: this.dom('level-select'),
            game: this.dom('game-screen'),
            victory: this.dom('victory-screen')
        };

        this.init();
    }

    init() {
        // Buttons
        this.dom('btn-start').onclick = () => {
            this.audio.playClick();
            this.audio.audioCtx.resume();
            this.showScreen('level');
        };

        this.dom('btn-back-home').onclick = () => this.showScreen('start');
        this.dom('btn-exit-level').onclick = () => {
            this.stopTimer();
            this.showScreen('level');
        };

        this.dom('btn-menu').onclick = () => this.showScreen('start');
        this.dom('btn-next-level').onclick = () => {
            const nextId = this.state.level.id + 1;
            const nextLevel = levels.find(l => l.id === nextId);
            if (nextLevel) {
                this.startLevel(nextLevel);
            } else {
                this.showScreen('level');
            }
        };

        this.dom('btn-check').onclick = () => this.checkAnswer();
        this.dom('btn-reset').onclick = () => this.resetWord();
        this.dom('btn-hint').onclick = () => this.useHint();
        this.dom('btn-music').onclick = () => {
            const isOn = this.audio.toggle();
            this.dom('btn-music').textContent = isOn ? '🔊' : '🔇';
        };

        // Hidden Input Logic for Mobile & Desktop
        const hiddenInput = this.dom('hidden-input');

        // Focus hidden input on any game click
        this.dom('game-screen').addEventListener('click', () => {
            hiddenInput.focus();
        });

        // Sync hidden input with game state
        hiddenInput.addEventListener('input', (e) => {
            const val = e.target.value.toUpperCase();
            // Allow backspace/shortening
            if (val.length < this.state.inputBuffer.length) {
                // Backspace detected
                this.state.inputBuffer = val;
            } else {
                // Typing
                // Only allow alphabetic
                const char = val.slice(-1);
                if (/[A-Z]/.test(char) && val.length <= this.state.currentWord.length) {
                    this.state.inputBuffer = val;
                } else {
                    // Revert invalid input in hidden field
                    hiddenInput.value = this.state.inputBuffer;
                }
            }
            this.renderSlots();
            this.audio.playClick();
        });

        // Physical Keyboard (still useful for Enter/Focus)
        document.addEventListener('keydown', (e) => {
            if (!this.screens.game.classList.contains('active')) return;
            hiddenInput.focus();

            if (e.key === 'Enter') {
                this.checkAnswer();
            }
        });

        this.renderLevelSelect();
    }

    showScreen(name) {
        Object.values(this.screens).forEach(s => {
            s.classList.remove('active');
            s.classList.add('hidden');
        });
        this.screens[name].classList.remove('hidden');
        this.screens[name].classList.add('active');
        this.audio.playClick();
    }

    renderLevelSelect() {
        const container = this.dom('levels-container');
        container.innerHTML = '';
        levels.forEach(level => {
            const card = document.createElement('div');
            card.className = 'level-card';
            card.innerHTML = `
        <h3>${level.name}</h3>
        <p>${level.description}</p>
        <div style="margin-top:10px;">
            <small>⭐ ${level.difficulty}</small>
        </div>
      `;
            card.onclick = () => {
                this.audio.playClick();
                this.startLevel(level);
            };
            container.appendChild(card);
        });
    }

    startLevel(level) {
        this.state.level = level;
        this.state.wordIndex = 0;
        this.state.combo = 0;
        this.state.score = 0;

        this.dom('app').style.backgroundImage = `url('${level.bg}')`;
        this.dom('current-level-name').textContent = level.name;

        this.updateHUD();
        this.showScreen('game');
        this.loadWord();
    }

    loadWord() {
        const wordItem = this.state.level.words[this.state.wordIndex];
        if (!wordItem) {
            this.levelComplete();
            return;
        }

        this.state.currentWord = wordItem.word;
        this.state.inputBuffer = ""; // Reset input
        if (this.dom('hidden-input')) this.dom('hidden-input').value = "";

        this.dom('word-hint').textContent = `"${wordItem.hint}"`;
        this.dom('feedback-message').classList.add('hidden');
        this.dom('feedback-message').className = 'feedback hidden';

        this.startTimer(this.state.level.timer);
        this.renderSlots();
    }

    renderSlots() {
        const dropZone = this.dom('drop-zone');
        dropZone.innerHTML = '';
        for (let i = 0; i < this.state.currentWord.length; i++) {
            const slot = document.createElement('div');
            slot.className = 'drop-slot';

            // Fill content from inputBuffer
            const char = this.state.inputBuffer[i] || '';
            slot.textContent = char;

            if (char) {
                slot.classList.add('filled');
            }

            // Highlight next active slot
            if (i === this.state.inputBuffer.length) {
                slot.classList.add('active-input');
            }

            dropZone.appendChild(slot);
        }
    }

    handleInput(key) {
        this.audio.playClick();

        if (key === 'BACKSPACE') {
            this.state.inputBuffer = this.state.inputBuffer.slice(0, -1);
        } else {
            // Append if not full
            if (this.state.inputBuffer.length < this.state.currentWord.length) {
                this.state.inputBuffer += key;
            }
        }

        this.renderSlots();
    }

    startTimer(seconds) {
        this.stopTimer();
        this.state.timer = seconds;
        const timerBox = this.dom('timer-box');

        this.updateTimerUI();

        this.timerInterval = setInterval(() => {
            this.state.timer--;
            this.updateTimerUI();

            if (this.state.timer <= 10) {
                timerBox.classList.add('warning');
            } else {
                timerBox.classList.remove('warning');
            }

            if (this.state.timer <= 0) {
                this.stopTimer();
                this.audio.playError();

                // Timeout Feedback
                const fb = this.dom('feedback-message');
                fb.textContent = 'Waktu Habis! ⌛';
                fb.className = 'feedback error';
                fb.classList.remove('hidden');

                // Skip to next word
                setTimeout(() => {
                    this.state.wordIndex++;
                    this.loadWord();
                }, 1500);
            }
        }, 1000);
    }

    stopTimer() {
        clearInterval(this.timerInterval);
        this.dom('timer-box').classList.remove('warning');
    }

    updateTimerUI() {
        const min = Math.floor(Math.abs(this.state.timer) / 60);
        const sec = Math.abs(this.state.timer) % 60;
        this.dom('timer-display').textContent = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }

    useHint() {
        if (this.state.coins >= 20) {
            const targetWord = this.state.currentWord;
            const currentInput = this.state.inputBuffer;

            // Find first mismatch or empty index
            let targetIndex = -1;
            for (let i = 0; i < targetWord.length; i++) {
                if (currentInput[i] !== targetWord[i]) {
                    targetIndex = i;
                    break;
                }
            }

            if (targetIndex !== -1) {
                // Construct new buffer with correct char at targetIndex
                // We need to preserve correct chars before targetIndex, set targetIndex, and maybe keep subsequent chars if they were correct? 
                // Simplest approach: Just set the buffer up to targetIndex + correctChar.
                // BUT user might have typed wrong letters after. Let's just correct the specific specific char at that index?
                // Since inputBuffer is sequential, we can't easily have "holes".
                // Strategy: auto-fill the buffer up to that point correctly.

                const correctChar = targetWord[targetIndex];

                // Rebuild buffer: keep up to targetIndex, force correct char, drop the rest (or try to keep?)
                // Let's just force the buffer to match targetWord up to targetIndex + 1
                this.state.inputBuffer = targetWord.substring(0, targetIndex + 1);

                this.state.coins -= 20;
                this.updateHUD();
                this.renderSlots();
                this.audio.playSuccess();
            }
        } else {
            this.dom('coin-display').style.color = 'red';
            setTimeout(() => this.dom('coin-display').style.color = 'white', 500);
            this.audio.playError();
        }
    }

    checkAnswer() {
        if (this.state.inputBuffer === this.state.currentWord) {
            // Correct
            this.stopTimer();
            this.audio.playSuccess();

            // Calculate Score
            const timeBonus = Math.max(0, this.state.timer * 10);
            const comboBonus = this.state.combo * 50;
            const wordPoints = 100;
            const totalPoints = wordPoints + timeBonus + comboBonus;

            this.state.score += totalPoints;
            this.state.coins += 10;
            this.state.combo++;

            // Show Feedback
            const fb = this.dom('feedback-message');
            fb.textContent = `Benar! +${totalPoints}`;
            fb.className = 'feedback success';
            fb.classList.remove('hidden');

            if (this.state.combo > 1) {
                const cb = this.dom('combo-display');
                cb.textContent = `COMBO x${this.state.combo}!`;
                cb.classList.remove('hidden');
                setTimeout(() => cb.classList.add('hidden'), 2000);
            }

            this.updateHUD();

            setTimeout(() => {
                this.state.wordIndex++;
                this.loadWord();
            }, 1500);

        } else {
            // Wrong
            this.audio.playError();
            this.state.combo = 0;

            const fb = this.dom('feedback-message');
            fb.textContent = 'Coba Lagi!';
            fb.className = 'feedback error';
            fb.classList.remove('hidden');

            // Optional: clear input on wrong? Or let user edit?
            // Let user edit is better UX.
        }
    }

    resetWord() {
        this.state.inputBuffer = "";
        if (this.dom('hidden-input')) this.dom('hidden-input').value = "";
        this.renderSlots();
        this.audio.playClick();
    }

    updateHUD() {
        this.dom('score-display').textContent = this.state.score;
        this.dom('coin-display').textContent = this.state.coins;
    }

    levelComplete() {
        this.audio.playWin();
        this.showScreen('victory');
        this.dom('final-score').textContent = this.state.score;
        this.dom('final-coins').textContent = this.state.coins;

        const maxScore = this.state.level.words.length * 200;
        let stars = '⭐';
        if (this.state.score > maxScore * 0.5) stars += '⭐';
        if (this.state.score > maxScore * 0.8) stars += '⭐';

        this.dom('final-stars').textContent = stars;
    }
}

// Start
new Game();
