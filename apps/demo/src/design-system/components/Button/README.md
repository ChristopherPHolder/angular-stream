Buttons trigger actions and lead to key pages, using the site's primary, ghost and tertiary styles.

- **Primary** (`color-primary-500`, hover `color-primary-600`): one per view for the main call to action, such as "Book a free call".
- **Ghost** (`color-primary-50` fill, `color-neutral-300` border): secondary actions next to a primary button.
- **Tertiary**: inline text link with an arrow that slides on hover, for "Learn more" links inside cards.
- Use `size="lg"` in heroes and the navigation bar; use the default size in dense layouts.
- Write labels in sentence case, starting with a verb.

The consumer provides the label and either `onClick` or `href`. White text on `color-primary-500` is 4.31:1; for labels below 24px, consider `color-primary-600` as the fill to reach WCAG AA.
