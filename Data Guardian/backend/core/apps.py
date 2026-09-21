import os
import shutil
import socket
import subprocess
import logging

from django.apps import AppConfig

logger = logging.getLogger(__name__)


def _is_ollama_running() -> bool:
    """Return True if something is already listening on Ollama's default port."""
    try:
        with socket.create_connection(("localhost", 11434), timeout=1):
            return True
    except OSError:
        return False


class CoreConfig(AppConfig):
    name = "core"
    _ollama_proc = None  # reference kept so the process outlives ready()

    def ready(self):
        # Only auto-start when Ollama is the configured AI provider
        if os.environ.get("AI_PROVIDER", "ollama") != "ollama":
            return

        if _is_ollama_running():
            logger.info("[Ollama] Server already running on port 11434 — skipping auto-start.")
            return

        # Prefer the official macOS app bundle binary (includes llama-server).
        # Fall back to the system PATH (brew) if the app bundle isn't present.
        _OFFICIAL_BINARY = "/Applications/Ollama.app/Contents/Resources/ollama"
        if os.path.isfile(_OFFICIAL_BINARY):
            ollama_bin = _OFFICIAL_BINARY
        else:
            ollama_bin = shutil.which("ollama")

        if not ollama_bin:
            logger.warning(
                "[Ollama] 'ollama' not found. "
                "Install from https://ollama.com/download  —  then run: ollama pull llama3.2"
            )
            return

        try:
            CoreConfig._ollama_proc = subprocess.Popen(
                [ollama_bin, "serve"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            logger.info("[Ollama] Server started (pid %d).", CoreConfig._ollama_proc.pid)
        except Exception as exc:
            logger.warning("[Ollama] Failed to start server: %s", exc)
