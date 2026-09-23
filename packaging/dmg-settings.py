# The disk image's window, as dmgbuild writes it into the image's .DS_Store.
# Loaded with:
#   dmgbuild -s dmg-settings.py -D here=<packaging> -D app=<Desktop Habitats.app> \
#            "Desktop Habitats" <out.dmg>

import os

# dmgbuild execs this file, so it has no __file__; the two paths come in as defines.
here = defines["here"]
app = defines["app"]

volume_name = "Desktop Habitats"

files = [app, os.path.join(here, "使用说明.txt")]
symlinks = {"Applications": "/Applications"}

background = os.path.join(here, "dmg-background.png")
badge_icon = os.path.join(app, "Contents", "Resources", "AppIcon.icns")

default_view = "icon-view"
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
arrange_by = None

# Matches dmg-background.png (1280x840, so exactly 2x of this) and the icon row the
# arrow in that background is drawn at.
window_rect = ((260, 180), (640, 420))
icon_size = 128
text_size = 14
icon_locations = {
    "Desktop Habitats.app": (170, 210),
    "Applications": (470, 210),
    "使用说明.txt": (320, 358),
}
