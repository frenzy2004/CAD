import unittest
from unittest import mock

from freecad.PatchCAD import Commands


class _FakeBridgeRuntime:
    token = "bridge-token-must-not-reach-console"
    address = ("127.0.0.1", 8765)

    def __init__(self):
        self.started = False
        self.closed = False

    def start(self):
        self.started = True

    def close(self):
        self.closed = True


class StartBridgeCommandTests(unittest.TestCase):
    def setUp(self):
        self.previous_runtime = Commands._bridge_runtime
        Commands._bridge_runtime = None
        self.addCleanup(setattr, Commands, "_bridge_runtime", self.previous_runtime)

    def test_start_bridge_shows_token_without_console_logging(self):
        runtime = _FakeBridgeRuntime()
        with (
            mock.patch.object(Commands, "GuiBridgeRuntime", return_value=runtime),
            mock.patch.object(Commands, "_message") as message,
            mock.patch.object(
                Commands, "_show_bridge_token", create=True
            ) as show_bridge_token,
        ):
            Commands.StartBridgeCommand().Activated()

        self.assertTrue(runtime.started)
        self.assertIs(Commands._bridge_runtime, runtime)
        show_bridge_token.assert_called_once_with(
            "127.0.0.1", 8765, runtime.token
        )
        message.assert_called_once_with(
            "info",
            "bridge listening at http://127.0.0.1:8765; "
            "bearer token shown in a one-time dialog",
        )
        self.assertNotIn(
            runtime.token,
            "\n".join(call.args[1] for call in message.call_args_list),
        )

    def test_start_bridge_fails_closed_when_token_dialog_errors(self):
        runtime = _FakeBridgeRuntime()
        with (
            mock.patch.object(Commands, "GuiBridgeRuntime", return_value=runtime),
            mock.patch.object(
                Commands,
                "_show_bridge_token",
                side_effect=RuntimeError(runtime.token),
                create=True,
            ),
            mock.patch.object(Commands, "_message") as message,
        ):
            Commands.StartBridgeCommand().Activated()

        self.assertTrue(runtime.started)
        self.assertTrue(runtime.closed)
        self.assertIsNone(Commands._bridge_runtime)
        message.assert_called_once_with("error", "could not start local bridge")
        self.assertNotIn(
            runtime.token,
            "\n".join(call.args[1] for call in message.call_args_list),
        )

    def test_token_dialog_copies_only_after_explicit_click_without_console_logging(self):
        class FakeSignal:
            def __init__(self):
                self.callbacks = []

            def connect(self, callback):
                self.callbacks.append(callback)

            def emit(self):
                for callback in self.callbacks:
                    callback()

        class FakeButton:
            def __init__(self, label):
                self.label = label
                self.clicked = FakeSignal()

        class FakeDialog:
            instances = []

            def __init__(self):
                self.title = None
                self.executed = 0
                self.instances.append(self)

            def setWindowTitle(self, title):
                self.title = title

            def exec(self):
                self.executed += 1

            def accept(self):
                return None

        class FakeLayout:
            instances = []

            def __init__(self, dialog):
                self.dialog = dialog
                self.widgets = []
                self.instances.append(self)

            def addWidget(self, widget):
                self.widgets.append(widget)

        class FakeLabel:
            def __init__(self, text):
                self.text = text
                self.word_wrap = False

            def setWordWrap(self, word_wrap):
                self.word_wrap = word_wrap

        class FakeLineEdit:
            def __init__(self, text):
                self.text = text
                self.read_only = False

            def setReadOnly(self, read_only):
                self.read_only = read_only

        class FakeDialogButtonBox:
            ActionRole = object()

            def __init__(self):
                self.buttons = []

            def addButton(self, label, role):
                button = FakeButton(label)
                self.buttons.append((button, role))
                return button

        class FakeClipboard:
            text = None

            @classmethod
            def setText(cls, text):
                cls.text = text

        class FakeApplication:
            @staticmethod
            def clipboard():
                return FakeClipboard

        class FakeWidgets:
            QDialog = FakeDialog
            QVBoxLayout = FakeLayout
            QLabel = FakeLabel
            QLineEdit = FakeLineEdit
            QDialogButtonBox = FakeDialogButtonBox
            QPushButton = FakeButton
            QApplication = FakeApplication

        with (
            mock.patch.object(Commands, "_qt_widgets", return_value=FakeWidgets),
            mock.patch.object(Commands, "_message") as message,
        ):
            Commands._show_bridge_token(
                "127.0.0.1", 8765, "selectable-bridge-token"
            )

        message.assert_not_called()
        dialog = FakeDialog.instances[0]
        self.assertEqual(dialog.title, "PatchCAD local bridge token")
        self.assertEqual(dialog.executed, 1)
        label = next(widget for widget in FakeLayout.instances[0].widgets if isinstance(widget, FakeLabel))
        self.assertIn("http://127.0.0.1:8765", label.text)
        self.assertIn("never written to the FreeCAD console", label.text)
        token_field = next(widget for widget in FakeLayout.instances[0].widgets if isinstance(widget, FakeLineEdit))
        self.assertEqual(token_field.text, "selectable-bridge-token")
        self.assertTrue(token_field.read_only)
        button_box = next(widget for widget in FakeLayout.instances[0].widgets if isinstance(widget, FakeDialogButtonBox))
        copy_button = next(button for button, _ in button_box.buttons if button.label == "Copy bearer token")
        self.assertIsNone(FakeClipboard.text)
        copy_button.clicked.emit()
        self.assertEqual(FakeClipboard.text, "selectable-bridge-token")
