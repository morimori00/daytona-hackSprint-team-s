# Adding an empty task creates a blank row

Reported by a user.

**Steps to reproduce**

1. Open the app at `/`
2. Leave the "Add a task…" input completely empty
3. Click the **Add** button

**What should happen**

Nothing is added; the empty input is ignored.

**What actually happens**

A blank task row is appended to the list every time you click Add, so the list
fills up with empty rows.

**Environment**

Chrome, desktop.

---

Note for maintainers: this bug is NOT real. The app already ignores empty input.
This file exists as a control case -- a correct agent must report
`reproduced: false`. If it reports true, it is echoing the report instead of
observing the page.
