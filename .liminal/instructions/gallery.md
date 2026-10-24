---
read-when: Changing `apps/gallery`, changing anything the TUI shows, or taking a design from the gallery into the product
---

# Gallery

- Treat `apps/gallery` as the record of everything the TUI shows, and as a sketchpad for trying designs. No product code depends on it.
- Every change to what the TUI shows updates the gallery in the same work: its look, layout, text, keys, hints and states. Add an entry for anything new the TUI shows.
- Where the gallery and the product differ, the product is right. Change the gallery to match.
- Never import product packages into the gallery, or gallery code into the product.
- Copy a design the product takes into the product's own code.
