# STEM Origin website

A static website (plain HTML, CSS and JavaScript). There is nothing to install or build. Upload the folder to any static host and point your domain at it.

## What's in the folder

```
index.html            Home
about-us.html         About Us
contact.html          Contact
get-involved.html     Get Involved (Chapter Leader Responsibilities + Chapter Leader Application)
registration.html     STEM Origin Registration (new page)
404.html              "Page not found" page (most hosts use it automatically)
favicon.svg           Browser tab icon
assets/css/styles.css All styling
assets/js/main.js     All interactions
assets/img/logo-mark.svg  Vector version of the logo mark
```

Keep this structure exactly as it is. The pages link to each other with relative paths.

## Preview on your computer

Double-click `index.html` to open it in a browser. Everything works locally except the 404 page, which only works once the site is hosted.

## Publish it on your domain

Wix does not let you upload your own HTML files, so these files need a static host. All three options below have a free tier and support custom domains.

**Netlify (easiest).** Create a free account, open the "Deploy manually" / drag-and-drop option, and drop the whole `stem-origin` folder onto the page. Your site goes live on a temporary netlify.app address. Then open the site's domain settings, add your custom domain, and follow the DNS records Netlify shows you.

**GitHub Pages.** Create a repository, upload the contents of this folder to it, and turn on Pages in the repository settings (deploy from the main branch, root folder). Add your domain in the Pages settings and create the DNS records GitHub lists.

**Vercel.** Create a project, upload or import the folder (no framework, no build command), then add your domain in the project's domain settings.

**Connecting the domain.** Wherever your domain is managed (your registrar, or Wix if you bought the domain through Wix), replace the existing records with the ones your new host gives you. DNS changes can take anywhere from a few minutes to a day or two to show up everywhere. HTTPS is set up automatically by all three hosts.

## Common edits

| What | Where |
|---|---|
| Donate button destination | Every page has two Donate links pointing to `contact.html`. When you have a donation page (for example a PayPal, Stripe or GoFundMe link), find-and-replace those `href` values. |
| Chapter Leader Application form | `get-involved.html`, the link with `data-gated` |
| STEM Origin Registration form | `registration.html`, the link inside the `apply__panel` |
| Contact email | Search all files for `saksham.shubh2010@gmail.com` |
| Colors and fonts | Top of `assets/css/styles.css` (the `:root` block) |

## Notes

- **Fonts.** The original site's headings use Murs Gothic, which is only available inside Wix. This site uses Archivo Expanded from Google Fonts, the closest free match, plus Inter for body text (the same as the original).
- **Accessibility.** Keyboard focus is visible everywhere, the mobile menu closes with Escape, and anyone with "reduce motion" turned on gets a calm, static version of every animation.
- **No tracking or cookies.** The only outside requests are to Google Fonts.
