#!/usr/bin/env python3
"""
Map Generator — desktop UI for building SVG maps from Excel data.

Uses Qt (PySide6) instead of Tkinter so it runs on macOS builds where Tcl/Tk aborts
with "macOS 15 (1507) or later required".

Run: python mapgen_app.py
"""
from __future__ import annotations

import os
import platform
import sys
import traceback

# Non-interactive Matplotlib before importing mapgen_core.
os.environ.setdefault("MPLBACKEND", "Agg")

from mapgen_core import GenerationConfig, default_cache_path, list_sheet_names, run_generation

try:
    from PySide6.QtCore import QObject, Qt, QThread, Signal, Slot
    from PySide6.QtGui import QFont, QPalette
    from PySide6.QtWidgets import (
        QApplication,
        QButtonGroup,
        QCheckBox,
        QComboBox,
        QFileDialog,
        QGridLayout,
        QGroupBox,
        QHBoxLayout,
        QLabel,
        QLineEdit,
        QMessageBox,
        QPushButton,
        QRadioButton,
        QScrollArea,
        QSizePolicy,
        QTextEdit,
        QVBoxLayout,
        QWidget,
    )
except ImportError:
    print(
        "PySide6 is required for the GUI.\n"
        "Install with: pip install PySide6\n",
        file=sys.stderr,
    )
    raise SystemExit(1) from None


def _configure_app_before_create() -> None:
    """Avoid fractional scale 'PassThrough' glitches that garble text on Retina macOS."""
    QApplication.setHighDpiScaleFactorRoundingPolicy(
        Qt.HighDpiScaleFactorRoundingPolicy.RoundPreferFloor
    )


def _apply_app_font(app: QApplication) -> None:
    if platform.system() == "Darwin":
        f = QFont(".AppleSystemUIFont")
    else:
        f = QFont("Segoe UI")
    if not f.exactMatch():
        f = QFont()
    f.setPointSize(13)
    f.setStyleHint(QFont.StyleHint.SansSerif)
    app.setFont(f)


class GenerationWorker(QObject):
    log_line = Signal(str)
    finished = Signal()

    def __init__(self, cfg: GenerationConfig) -> None:
        super().__init__()
        self._cfg = cfg

    @Slot()
    def run(self) -> None:
        try:

            def log(msg: str) -> None:
                self.log_line.emit(msg)

            run_generation(self._cfg, log=log)
        except Exception:
            self.log_line.emit(traceback.format_exc())
        finally:
            self.finished.emit()


def _hint_label(text: str) -> QLabel:
    lab = QLabel(text)
    lab.setWordWrap(True)
    f = lab.font()
    f.setPointSize(11)
    lab.setFont(f)
    lab.setForegroundRole(QPalette.ColorRole.Mid)
    return lab


class MapgenWindow(QWidget):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Map Generator")
        self.setMinimumSize(720, 640)
        self.setMinimumWidth(700)

        self._thread: QThread | None = None
        self._worker: GenerationWorker | None = None

        self._excel_path = QLineEdit()
        self._excel_path.setPlaceholderText("Choose an .xlsx file…")
        self._sheet = QComboBox()
        self._sheet.setMinimumContentsLength(40)
        self._sheet.setSizeAdjustPolicy(QComboBox.SizeAdjustPolicy.AdjustToMinimumContentsLengthWithIcon)

        self._mode_user = QRadioButton("User events")
        self._mode_uni = QRadioButton("Universities")
        self._mode_user.setChecked(True)
        self._mode_group = QButtonGroup(self)
        self._mode_group.addButton(self._mode_user)
        self._mode_group.addButton(self._mode_uni)

        self._mode_detail = QLabel(
            "User events: City, State, Country. Optional filter on “On Map?” = yes.\n"
            "Universities: first column name + second column location."
        )
        self._mode_detail.setWordWrap(True)
        df = self._mode_detail.font()
        df.setPointSize(11)
        self._mode_detail.setFont(df)
        self._mode_detail.setForegroundRole(QPalette.ColorRole.Mid)

        self._only_on_map = QCheckBox('Only include rows where “On Map?” is yes')
        self._only_on_map.setChecked(True)

        self._regions: dict[str, QCheckBox] = {
            "world": QCheckBox("World"),
            "europe": QCheckBox("Europe"),
            "asia": QCheckBox("Asia"),
            "north_america": QCheckBox("North America"),
            "south_america": QCheckBox("South America"),
        }
        for cb in self._regions.values():
            cb.setChecked(True)
            cb.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Fixed)

        self._out_dir = QLineEdit()
        self._basename = QLineEdit("map")
        self._scale_members = QCheckBox("Scale points by Member Count (if column exists)")
        self._open_done = QCheckBox("Open generated files when finished")
        self._open_done.setChecked(True)
        self._api_key = QLineEdit()
        self._api_key.setEchoMode(QLineEdit.EchoMode.Password)
        self._api_key.setText(os.environ.get("OPENAI_API_KEY", ""))
        self._api_key.setPlaceholderText("Optional if OPENAI_API_KEY is set")

        self._log = QTextEdit()
        self._log.setReadOnly(True)
        self._log.setMinimumHeight(180)
        self._log.setFont(QFont("Menlo", 11) if platform.system() == "Darwin" else QFont("Consolas", 10))

        self._gen_btn = QPushButton("Generate maps")
        self._gen_btn.setMinimumHeight(40)
        self._gen_btn.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self._gen_btn.clicked.connect(self._start_generation)

        self._build_layout()
        self._mode_user.toggled.connect(self._on_mode_change)
        self._mode_uni.toggled.connect(self._on_mode_change)
        self._on_mode_change()

    def _build_layout(self) -> None:
        inner = QWidget()
        inner.setMinimumWidth(660)
        root = QVBoxLayout(inner)
        root.setSpacing(14)
        root.setContentsMargins(8, 8, 8, 8)

        title = QLabel("Map Generator")
        tf = title.font()
        tf.setPointSize(20)
        tf.setBold(True)
        title.setFont(tf)
        root.addWidget(title)

        sub = QLabel(
            "Load an Excel file, choose how locations are read, pick which maps to build, then generate SVGs."
        )
        sub.setWordWrap(True)
        root.addWidget(sub)

        # Spreadsheet
        file_box = QGroupBox("Spreadsheet")
        fl = QHBoxLayout(file_box)
        self._excel_path.setMinimumHeight(28)
        fl.addWidget(self._excel_path, 1)
        browse = QPushButton("Browse…")
        browse.setFixedWidth(100)
        browse.clicked.connect(self._browse_excel)
        fl.addWidget(browse)
        root.addWidget(file_box)

        sheet_box = QGroupBox("Worksheet")
        sl = QVBoxLayout(sheet_box)
        sl.addWidget(self._sheet)
        root.addWidget(sheet_box)

        mode_box = QGroupBox("Data source")
        ml = QVBoxLayout(mode_box)
        row_mode = QHBoxLayout()
        row_mode.addWidget(self._mode_user)
        row_mode.addWidget(self._mode_uni)
        row_mode.addStretch(1)
        ml.addLayout(row_mode)
        ml.addWidget(self._mode_detail)
        ml.addWidget(self._only_on_map)
        root.addWidget(mode_box)

        reg_box = QGroupBox("Maps to generate")
        rg = QGridLayout(reg_box)
        rg.setHorizontalSpacing(20)
        rg.setVerticalSpacing(8)
        keys = ["world", "europe", "asia", "north_america", "south_america"]
        for i, k in enumerate(keys):
            rg.addWidget(self._regions[k], i // 3, i % 3, alignment=Qt.AlignmentFlag.AlignLeft)
        root.addWidget(reg_box)

        out_box = QGroupBox("Output")
        ol = QVBoxLayout(out_box)
        row_folder = QHBoxLayout()
        row_folder.addWidget(QLabel("Folder"))
        self._out_dir.setMinimumHeight(28)
        row_folder.addWidget(self._out_dir, 1)
        ob = QPushButton("Browse…")
        ob.setFixedWidth(100)
        ob.clicked.connect(self._browse_out_dir)
        row_folder.addWidget(ob)
        ol.addLayout(row_folder)
        row_prefix = QHBoxLayout()
        row_prefix.addWidget(QLabel("File prefix"))
        row_prefix.addWidget(self._basename, 1)
        ol.addLayout(row_prefix)
        ol.addWidget(_hint_label("Files: prefix.svg, prefix_europe.svg, prefix_asia.svg, …"))
        root.addWidget(out_box)

        opt_box = QGroupBox("Options")
        opl = QVBoxLayout(opt_box)
        opl.addWidget(self._scale_members)
        opl.addWidget(self._open_done)
        root.addWidget(opt_box)

        api_box = QGroupBox("OpenAI API key")
        al = QVBoxLayout(api_box)
        self._api_key.setMinimumHeight(28)
        al.addWidget(self._api_key)
        al.addWidget(_hint_label("Leave blank to use the OPENAI_API_KEY environment variable."))
        root.addWidget(api_box)

        root.addWidget(self._gen_btn)
        root.addWidget(QLabel("Log"))
        root.addWidget(self._log, 1)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QScrollArea.Shape.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.setWidget(inner)

        outer = QVBoxLayout(self)
        outer.setContentsMargins(16, 16, 16, 16)
        outer.addWidget(scroll)

    def _browse_excel(self) -> None:
        path, _ = QFileDialog.getOpenFileName(
            self,
            "Choose Excel file",
            "",
            "Excel (*.xlsx *.xls);;All files (*.*)",
        )
        if not path:
            return
        self._excel_path.setText(path)
        if not self._out_dir.text().strip():
            self._out_dir.setText(os.path.dirname(path))
        self._load_sheets(path)

    def _browse_out_dir(self) -> None:
        d = QFileDialog.getExistingDirectory(self, "Output folder")
        if d:
            self._out_dir.setText(d)

    def _load_sheets(self, path: str) -> None:
        try:
            names = list_sheet_names(path)
        except Exception as e:
            QMessageBox.critical(self, "Excel", f"Could not read worksheets:\n{e}")
            return
        self._sheet.clear()
        for n in names:
            self._sheet.addItem(n)
        if not names:
            return
        mode = "user_events" if self._mode_user.isChecked() else "universities"
        preferred = "FY 2026" if mode == "user_events" else "Schools --> Customers"
        for i in range(self._sheet.count()):
            if self._sheet.itemText(i) == preferred:
                self._sheet.setCurrentIndex(i)
                return
        self._sheet.setCurrentIndex(0)

    def _on_mode_change(self) -> None:
        self._only_on_map.setEnabled(self._mode_user.isChecked())
        path = self._excel_path.text().strip()
        if path and os.path.isfile(path):
            self._load_sheets(path)

    def _start_generation(self) -> None:
        if self._thread is not None and self._thread.isRunning():
            return

        path = self._excel_path.text().strip()
        if not path or not os.path.isfile(path):
            QMessageBox.warning(self, "Spreadsheet", "Choose a valid Excel file.")
            return
        sheet = self._sheet.currentText().strip()
        if not sheet:
            QMessageBox.warning(self, "Worksheet", "Select a worksheet.")
            return
        regions = {k for k, cb in self._regions.items() if cb.isChecked()}
        if not regions:
            QMessageBox.warning(self, "Maps", "Select at least one map to generate.")
            return
        out_dir = self._out_dir.text().strip() or os.path.dirname(path)
        api = self._api_key.text().strip() or os.environ.get("OPENAI_API_KEY", "")
        if not api:
            QMessageBox.warning(
                self,
                "API key",
                "Enter an OpenAI API key or set OPENAI_API_KEY in your environment.",
            )
            return

        mode = "user_events" if self._mode_user.isChecked() else "universities"
        cfg = GenerationConfig(
            excel_path=path,
            sheet_name=sheet,
            mode=mode,
            only_on_map=self._only_on_map.isChecked(),
            use_member_count_size=self._scale_members.isChecked(),
            output_dir=out_dir,
            output_basename=self._basename.text().strip() or "map",
            regions=regions,
            cache_path=default_cache_path(),
            api_key=api,
            open_outputs=self._open_done.isChecked(),
        )

        self._log.clear()
        self._gen_btn.setEnabled(False)

        self._thread = QThread()
        self._worker = GenerationWorker(cfg)
        self._worker.moveToThread(self._thread)
        self._thread.started.connect(self._worker.run)
        self._worker.log_line.connect(self._append_log)
        self._worker.finished.connect(self._on_generation_finished)
        self._worker.finished.connect(self._thread.quit)
        self._worker.finished.connect(self._worker.deleteLater)
        self._thread.finished.connect(self._thread.deleteLater)
        self._thread.start()

    @Slot(str)
    def _append_log(self, line: str) -> None:
        self._log.append(line)

    @Slot()
    def _on_generation_finished(self) -> None:
        self._append_log("— Done —")
        self._gen_btn.setEnabled(True)
        self._thread = None
        self._worker = None


def main() -> None:
    _configure_app_before_create()
    app = QApplication(sys.argv)
    _apply_app_font(app)

    # Fusion + macOS dark mode often corrupts control labels; use native style on macOS.
    if platform.system() != "Darwin":
        app.setStyle("Fusion")

    w = MapgenWindow()
    w.resize(760, 820)
    w.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
