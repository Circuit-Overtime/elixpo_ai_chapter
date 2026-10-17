PYTHON ?= python3
LATEXMK ?= latexmk

.PHONY: all assets clean

all: qfabric-paper.pdf

assets:
	$(PYTHON) ../scripts/generate-paper-assets.py

qfabric-paper.pdf: qfabric-paper.tex references.bib assets
	$(LATEXMK) -pdf -interaction=nonstopmode -halt-on-error qfabric-paper.tex

clean:
	$(LATEXMK) -C qfabric-paper.tex
