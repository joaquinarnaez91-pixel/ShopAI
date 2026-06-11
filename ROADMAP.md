# MVP Backlog (in priority order)

- [ ] 1. Gemini prettify verified — worn/hanger/flat photos → clean flat-lay, logos preserved, <20s (in progress)
- [x] 2. Brand autocomplete — live filtered suggestions while typing in closet brand field
- [x] 3. Visual outfit cards in chat — outfit recommendations render closet item photos as a collage card, not text
- [ ] 4. Re-prettify button on existing closet items
- [ ] 5. Home screen daily suggestion — weather + closet → one outfit card on open
- [ ] 6. Polish pass — loading states, prettify error handling, empty-closet state
- [ ] 7. Item detail view: tap closet item → full-screen detail (image, editable name/brand, category, actions: Style this item / Find similar / Re-prettify / Remove)
- [ ] 8. Share card: editorial card generator with background color picker (reuses composeEditorialCard)

- [x] 9. Shop similar product grid in item detail view — auto-loaded 2-col grid below item fields; Claude generates search queries, SerpAPI fetches up to 8 products; ❤️ taste signal on like
- [x] 10. Multi-garment detection and split on closet upload — Claude detects items in a photo, Gemini extracts each one separately, frontend shows a review list before saving
- [ ] 11. Avatar / VTON — Gemini dresses a matched model, face-swap API (InsightFace-based, ~$0.01–0.05/image) stamps your face on as a post-process

**MVP done when:** a friend can sign up, add 5 items photographed any way, and get a visual outfit suggestion from their own clothes that looks good enough to screenshot.
