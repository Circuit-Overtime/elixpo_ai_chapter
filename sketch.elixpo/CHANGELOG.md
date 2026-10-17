# Changelog

## v5.5.4 (2026-06-08)

### Other
- corrected the deploy script
- [ELIXPO] Text shape gains E/W midpoint anchors (#48 phase D) (#50)
- [ELIXPO] Text tool: bordered swatch + selection lifecycle + light textbox outline (#48 A+B+C) (#49)
- [ELIXPO] Port blogs.elixpo editor block styles to docs panel (light + dark) (#47)


## v5.4.8 (2026-04-24)

### Other
- Rebrand: Rename all occurrences of `elixpo/lixsketch` to `elixpo/sketch.elixpo`
- Rebrand: Rename `@elixpo/lixsketch` package to `@elixpo/lixsketch`
- Rebrand: Rename `packages/lixsketch/` directory to `packages/sketch.elixpo/`
- Update all documentation, GitHub URLs, and internal imports to match the new name


## v5.4.7 (2026-04-12)

### Other
- deploy: v5.4.7
- deploy: v5.4.5
- deploy: v5.4.4
- deploy: v5.4.3
- Enhance multi-selection drag behavior to prevent accidental deselection when clicking within selection bounds
- Fix icon drag ghost element and stale shape count in selection
- Fix icon SVG previews being cut off in sidebar grid and
- Enhance SVG normalization to ensure proper rendering and viewBox attributes
- Fix event handling in multiple tools to prevent actions without a target element
- Enhance event handling and selection logic; improve auto-save functionality and UI feedback


## v5.4.2 (2026-03-24)

### Other
- Enhance error handling for shape bounding box retrieval and add caching for icon fetch results
- Add double-click functionality to enter text edit mode and update textTool exports


## v5.4.1 (2026-03-24)

### Fixes
fix FreehandStroke getShapeBounds to account for move offset

### Other
- Add rotation line handling in FreehandStroke and enhance mouse up logic in freehandTool
- Refactor FreehandStroke and freehandTool to streamline arrow updates and frame containment logic during drag operations
- Refactor FreehandStroke to simplify transformation handling and remove unnecessary move offset logic
- Enhance auto-scroll functionality and improve shape transformation handling in FreehandStroke
- updated the multi select to work with the perspective of the full canvas during multi drag
- Add anchor position updates during frame attachment point calculations


## v5.4.0 (2026-03-22)

### Other
- Implement auto-scroll functionality during drag events and enhance multi-selection shape toggling


## v5.3.3 (2026-03-22)


## v4.6.3 (2026-03-22)

### Fixes
fixed the webview to default selection tool after loading
fixed the file icon type to be packed to market place

### Other
- updated the canvas opening logic to avoid any same name crashes
- publishing correct version
- updated the new extension
- release: v5.3.2


## v5.3.2 (2026-03-22)

### Fixes
fixed the webview to default selection tool after loading
fixed the file icon type to be packed to market place

### Other
- updated the new extension
- release: v5.3.2


## v5.3.2 (2026-03-22)

### Fixes
fixed the webview to default selection tool after loading
fixed the file icon type to be packed to market place

### Other
- release: v5.3.2


## v5.3.2 (2026-03-22)


## v5.3.2 (2026-03-22)


## v4.6.2 (2026-03-22)

### Other
- deploy: v5.3.2
- deploy: v5.3.1
- Rewrite useAutoSave.js with new persistence architecture and useing localstorage as the cache


## v4.6.1 (2026-03-22)


## v4.6.0 (2026-03-22)

### Other
- added new images and regulated readme
- regulated some blogs section
- added new imags for the vs code extesion readme
- deploy: v5.2.13
- updated minor patch version
- altered the styles of two blogs
- create a npm packaeg and vs code extension resource pack for the resources section of the main website and attached vscode market place link
- remoevd the logic to creaye the release logs for the deployment


## v4.5.10 (2026-03-22)


## v4.5.9 (2026-03-22)

### Other
- updated the look of the editing pannel
- updated the look of the toolbar a bit to fit it in size
- updated the property pannel to look like  the website
- updated the tollbar section to show the ai generared sections
- made the hotkeys and keybinds and other preferences for the extensio
- icon theme pack and the extension menu bar and exports handled
- Rewrite EditorProvider with full website UI (header, toolbar, menu, shortcuts, help)
- Rewrite EditorProvider webview HTML with full website UI
- edited name and found the vs code structure
- Merge pull request #2 from elixpo/feat/plugin


## v5.2.12 (2026-03-22)

### Other
- updated the look of the editing pannel
- updated the look of the toolbar a bit to fit it in size
- updated the property pannel to look like  the website
- updated the tollbar section to show the ai generared sections
- made the hotkeys and keybinds and other preferences for the extensio
- icon theme pack and the extension menu bar and exports handled
- Rewrite EditorProvider with full website UI (header, toolbar, menu, shortcuts, help)
- Rewrite EditorProvider webview HTML with full website UI
- edited name and found the vs code structure
- Merge pull request #2 from elixpo/feat/plugin


## v4.5.8 (2026-03-21)

### Features
- update package version to 4.5.5, enhance deploy script for npm publishing, and add changelog entries for new features and fixes
- update deploy script to use sudo for npm commands and enhance changelog with version 4.5.4 details
- rename package references from @lixsketch to @elixpo/lixsketch and add LICENSE file
- update package name in package.json and modify .gitignore to include *.vsix
- update package script to exclude dependencies during packaging
- update .vscodeignore to include necessary files for packaging
- add icon.png for LixSketch VS Code extension
- add README.md for LixSketch VS Code extension with usage instructions and features
- add LICENSE file with MIT License terms
- add engine package launch blog post and update navigation links
- add LixSketch VS Code extension with custom editor and toolbar
- enhance SketchEngine with event handling and public API surfaces
- add keybinds (G/U) to image source picker and fix positioning
- add Research Paper tab to AI modal for publication-quality architecture diagrams
- wire shading, label styling, and frame imageURL through AIRenderer and LixScript parser
- massively improve AI system prompts with granular controls and research paper mode
- add image-in-frame via URL support
- add gradient shading support to Rectangle and Circle shapes
- add padded background behind text labels in Rectangle and Circle shapes
- implement quick save functionality with cloud sync and update shortcut descriptions
- implement quick save functionality with cloud sync and update shortcut descriptions
- enhance save status handling with immediate local marking after cloud sync
- enhance save status handling with immediate local marking after cloud sync
- implement user kick functionality and handle notifications for kicked users
- implement user kick functionality and handle notifications for kicked users
- add Canvas Properties modal and integrate save status indicator
- add Canvas Properties modal and integrate save status indicator
- implement save status indicator and enhance auto-save functionality
- implement save status indicator and enhance auto-save functionality
- add InkFlowa v1 showcase section with enhanced visuals and links
- add InkFlowa v1 showcase section with enhanced visuals and links
- update star history section to use timeline for improved visualization
- update star history section to use timeline for improved visualization
- update star history section with responsive image support
- update star history section with responsive image support
- revamp README for clarity and enhanced presentation of features
- revamp README for clarity and enhanced presentation of features
- update deploy script to support multiple command chaining
- update deploy script to support multiple command chaining
- improve workspace handling in auto-save and session ID management
- improve workspace handling in auto-save and session ID management
- enhance session ID management for new workspaces and clean URL handling
- enhance session ID management for new workspaces and clean URL handling
- remove unused router and authentication logic from LandingPage component
- remove unused router and authentication logic from LandingPage component
- refine session ID extraction logic to exclude 'new' segment in URL
- refine session ID extraction logic to exclude 'new' segment in URL
- disable legacy category and search listeners in iconTool for React integration
- disable legacy category and search listeners in iconTool for React integration
- update IconCell styles for improved layout and responsiveness in IconSidebar
- update IconCell styles for improved layout and responsiveness in IconSidebar
- enhance IconSidebar grid layout for better icon display and improve event handling in EventDispatcher and Selection modules
- enhance IconSidebar grid layout for better icon display and improve event handling in EventDispatcher and Selection modules
- update IconSidebar grid layout for improved icon display and adjust icon tool behavior to maintain tool state after placing icons
- update IconSidebar grid layout for improved icon display and adjust icon tool behavior to maintain tool state after placing icons
- enhance HelpModal and Toolbar layout, improve event handling in SketchEngine and EventDispatcher
- enhance HelpModal and Toolbar layout, improve event handling in SketchEngine and EventDispatcher
- update icon layout to use a responsive grid for better display
- update icon layout to use a responsive grid for better display
- add FindBar component and integrate find functionality in canvas and keyboard shortcuts
- add FindBar component and integrate find functionality in canvas and keyboard shortcuts
- improve frame shape handling during serialization and restoration
- improve frame shape handling during serialization and restoration
- enhance shape serialization with fill style, color, grid size, and color options
- enhance shape serialization with fill style, color, grid size, and color options
- add fill style and color options to Frame component
- add fill style and color options to Frame component
- implement context menu for canvas with copy, paste, and shape actions
- implement context menu for canvas with copy, paste, and shape actions
- enhance removeSelection method to clear selection outlines and anchors
- enhance removeSelection method to clear selection outlines and anchors
- enhance authentication flow and improve user experience with session management
- enhance authentication flow and improve user experience with session management
- add AI request limits and usage overview to profile page
- add AI request limits and usage overview to profile page
- implement AI usage tracking and quota management for users and guests
- implement AI usage tracking and quota management for users and guests
- implement workspace limits and tracking for user and guest sessions
- implement workspace limits and tracking for user and guest sessions
- enforce room limit to one per user for better resource management
- enforce room limit to one per user for better resource management
- add auto-open file picker for image tool activation
- add auto-open file picker for image tool activation
- improve IconCell button accessibility and optimize icon fetching logic
- improve IconCell button accessibility and optimize icon fetching logic
- refactor resizing logic for Frame, Rectangle, Icon, and Image tools to improve rotation handling and maintain aspect ratio
- refactor resizing logic for Frame, Rectangle, Icon, and Image tools to improve rotation handling and maintain aspect ratio
- enhance pricing page visuals with improved dot grid opacity, margin doodle colors, and ambient glow effects
- enhance pricing page visuals with improved dot grid opacity, margin doodle colors, and ambient glow effects
- enhance pricing page with animated price display, ambient glow effects, and margin doodles; improve UI responsiveness and visual appeal
- enhance pricing page with animated price display, ambient glow effects, and margin doodles; improve UI responsiveness and visual appeal
- implement pricing page with plan details, toggle for monthly/annual billing, and enhanced UI components
- implement pricing page with plan details, toggle for monthly/annual billing, and enhanced UI components
- enhance SaveModal with export options for PNG, SVG, and PDF; improve preview generation and UI layout
- enhance SaveModal with export options for PNG, SVG, and PDF; improve preview generation and UI layout
- enhance deploy script with D1 and KV binding IDs for Cloudflare Pages deployment
- enhance deploy script with D1 and KV binding IDs for Cloudflare Pages deployment
- implement scene deletion API endpoint and integrate with SaveModal for revoking shared links
- implement scene deletion API endpoint and integrate with SaveModal for revoking shared links
- implement RoadmapPage with timeline sections for shipped, in-progress, and planned features, including interactive elements and visual enhancements
- implement RoadmapPage with timeline sections for shipped, in-progress, and planned features, including interactive elements and visual enhancements
- enhance RoughLixScriptCanvas with label background cutout effect and refactor label drawing logic + custom scrollbar for the global css
- enhance RoughLixScriptCanvas with label background cutout effect and refactor label drawing logic + custom scrollbar for the global css
- add RoughLixScriptCanvas component for enhanced LixScript rendering and update LixScriptParser to export resolveShapeRefs function
- add RoughLixScriptCanvas component for enhanced LixScript rendering and update LixScriptParser to export resolveShapeRefs function
- implement CommunityPage with interactive elements and Markdown content
- implement CommunityPage with interactive elements and Markdown content
- Replace Coming Soon pages with CanvasPageLayout for Use Cases, Roadmap, and Teams
- Replace Coming Soon pages with CanvasPageLayout for Use Cases, Roadmap, and Teams
- enhance BlogPostPage and MarkdownRenderer with RoughJS elements for improved visual styling
- enhance BlogPostPage and MarkdownRenderer with RoughJS elements for improved visual styling
- implement WebGL particle constellation and enhance animation effects on landing page
- implement WebGL particle constellation and enhance animation effects on landing page
- refactor environment variable handling for collaboration and worker URLs
- refactor environment variable handling for collaboration and worker URLs
- add 'edge' runtime export to multiple API routes and layouts
- add 'edge' runtime export to multiple API routes and layouts
- add logo click functionality to reload or navigate to home
- add logo click functionality to reload or navigate to home
- enhance BlogPostPage and MarkdownRenderer with improved styling and functionality
- enhance BlogPostPage and MarkdownRenderer with improved styling and functionality
- enhance documentation and UI components
- enhance documentation and UI components
- Implement Coming Soon pages for Pricing, Blog, Community, How to Start, Security, Use Cases, and Roadmap
- Implement Coming Soon pages for Pricing, Blog, Community, How to Start, Security, Use Cases, and Roadmap
- add framer-motion for animations and update package dependencies
- add framer-motion for animations and update package dependencies
- Implement auto-save functionality and enhance AppMenu and HelpModal with documentation links
- Implement auto-save functionality and enhance AppMenu and HelpModal with documentation links
- Update LixScript specifications and examples for improved clarity and consistency
- Update LixScript specifications and examples for improved clarity and consistency
- Enhance LixScript LLM specification and improve diagram generation instructions
- Enhance LixScript LLM specification and improve diagram generation instructions
- Update LixScript LLM model and enhance specification details
- Update LixScript LLM model and enhance specification details
- Add LixScript documentation page and LLM specification
- Add LixScript documentation page and LLM specification
- implement deploy script for Cloudflare Worker with upload, build, and migration commands
- implement deploy script for Cloudflare Worker with upload, build, and migration commands
- add LixScriptParser for parsing and rendering LixScript diagrams
- add LixScriptParser for parsing and rendering LixScript diagrams
- **api**: add image signing and scene management endpoints
- **api**: add image signing and scene management endpoints
- Implement collaboration feature with WebSocket support and user presence tracking
- Implement collaboration feature with WebSocket support and user presence tracking
- Add live collaboration feature with shareable link and error handling
- Add live collaboration feature with shareable link and error handling
- Refactor OAuth callback handling and improve error logging
- Refactor OAuth callback handling and improve error logging
- Update workspace name handling to initialize from localStorage and allow empty names
- Update workspace name handling to initialize from localStorage and allow empty names
- Add workspace name parameter to room initialization and database insertion
- Add workspace name parameter to room initialization and database insertion
- Implement OAuth callback handling with token exchange and user profile fetching
- Implement OAuth callback handling with token exchange and user profile fetching
- Enhance selection controls for Arrow, Circle, Line, and Rectangle shapes
- Enhance selection controls for Arrow, Circle, Line, and Rectangle shapes
- Implement shared scene loading with encryption and error handling
- Implement shared scene loading with encryption and error handling
- Integrate authentication state in Home, Header, and AppMenu components
- Integrate authentication state in Home, Header, and AppMenu components
- Implement OAuth authentication flow with session management and user state handling
- Implement OAuth authentication flow with session management and user state handling
- Add authentication and session management routes with OAuth integration
- Add authentication and session management routes with OAuth integration
- Implement RoomDurableObject for real-time collaboration and add REST API for scene management
- Implement RoomDurableObject for real-time collaboration and add REST API for scene management
- Add multi-selection frame actions and UI component
- Add multi-selection frame actions and UI component
- Add Sign In button to AppMenu with hover effect
- Implement session management and E2E encryption; add shareable link functionality and workspace name generation
- Enhance header and menu components for zen mode support; add tool lock functionality in toolbar
- Implement view and zen modes with corresponding UI adjustments and keyboard shortcuts
- Add Export Image functionality with modal and keyboard shortcuts support
- Enhance AppMenu and CommandPalette with action support and improved command handling
- Add Command Palette and Help Modal with keyboard shortcuts support
- **Line**: Support dashed and dotted lines with plain SVG rendering
- **MermaidFlowchartRenderer**: Add fill, stroke, and strokeWidth properties to node rendering
- **AIModal**: Add side-by-side live preview for Mermaid diagrams with error handling
- **AIModal**: Enhance Mermaid diagram support with unified parser and renderer feat(FrameSidebar): Update frame type detection for AI editing feat(AIRenderer): Implement lazy-loading for sequence diagram rendering feat(MermaidSequenceParser): Add parser for Mermaid sequence diagrams feat(MermaidSequenceRenderer): Create renderer for high-quality SVG sequence diagrams
- **AIModal**: Refactor header and improve layout for better usability
- **graph-engine**: Implement Graph Engine for rendering mathematical graphs
- add invisible backdrop to close menu on outside click
- add keyboard shortcuts for deleting selected shapes and cleanup attachments
- add grid functionality with toggle and keyboard shortcut support
- implement eraser trail cleanup on tool switch and improve trail rendering
- add custom cursor for laser tool

### Fixes
- update version to 4.2.3 and correct author information in package.json
- update import paths for engine modules in route.js and MarkdownRenderer.jsx
fixed image rendeinf in frame and standalone in the image based blogs and also fixed the issue of the cured arrows not showing up
fixed the blog and the image rendering urls
fixing the load from localstorage interactivty in the canvas
fixed the errors of isNearAnchor
fixed the modal for the image generation with mode details
fixed the image edit and other image generation factors
fixed the deploy.sh to ignore the git version
fixed the deploy.sh to ignore the git version
- update image source picker text and remove auto-open file picker logic
- remove unnecessary closing brace in useAutoSave function
- remove unnecessary closing brace in useAutoSave function
- enhance destroy method to properly handle contained shapes in diagram frames
- enhance destroy method to properly handle contained shapes in diagram frames
- correct spelling of InkFlowa to InkFlow in landing page
- correct spelling of InkFlowa to InkFlow in landing page
- update used workspaces calculation in UsageBar component
- update used workspaces calculation in UsageBar component
- update secrets upload command to include both Worker and Pages, and improve usage documentation
- update secrets upload command to include both Worker and Pages, and improve usage documentation
- update button labels in SaveModal for clarity and consistency
- update button labels in SaveModal for clarity and consistency
- update SITE_DESCRIPTION to remove reference to Eraser.io
- update SITE_DESCRIPTION to remove reference to Eraser.io
- update deploy script to use sudo for wrangler commands and remove unnecessary cleanup step
- update deploy script to use sudo for wrangler commands and remove unnecessary cleanup step
- update next dependency version to 15.5.2 for security improvements
- update next dependency version to 15.5.2 for security improvements
- Prevent menu closing when clicking on preferences submenu
- Prevent menu closing when clicking on preferences submenu
- Update serializer method calls to use new save and load functions
- Update serializer method calls to use new save and load functions
- Optimize session ID URL handling to preserve query parameters and hash
- Optimize session ID URL handling to preserve query parameters and hash
- Update OAuth login to use environment variable for clientId and redirectUri
- Update OAuth login to use environment variable for clientId and redirectUri
- Update WORKER_URL and clientId to use environment variables for OAuth flow
- Update WORKER_URL and clientId to use environment variables for OAuth flow
- Update database commands in package.json for consistency
- Update database commands in package.json for consistency
- Add 'plans/' directory to .gitignore
- Add 'plans/' directory to .gitignore
- Limit AppMenu height and enable scrolling for long content
- Limit AppMenu height and enable scrolling for long content
- update laser tool cursor SVG for improved visibility and styling
fixed the text tool to show propety pannel
fixed the selection recangle to of the circle and rectangle
fixed memory leak and the big were the element checks cache for the regeneration
fixed the anchor of the line from disappering
fixed rectangles, text inside frames and text box zoom adjustment , fixed system prompt for word spacng and the coordinate mismatcj
fixed the stray selectionrectangle being persistent and the texttool bug fixes, frame tool text based interaction
fixed the bugs of the frame and the selection of the frame and updated the shortcut of ctrl  + a
fixed rendering issue and applied direct parser for mermaid
fixed the tool deselection and zoom feature
fixed the ndefined reference and the imports + arrow styles of arrow
fixed the eraser being non functional
fixed the fill style icons
fixed the canvas interaction issue
fixing undefined global variables
fixed icons ont he toolbar
fixed interception of the ctrl + scrol
fixed the syntax error for }
fixed the constnt declaration errro
fixed all the dir level imports at the ./ for all the .js files
fixed the ctrl + s trigger on the save dialogue box
fixed the eraser deselect all mechanism
fixed the look of the canvastoolbar
fixed the eraser trail cause of the zoom and the mouse over and also the selection with the event listerners
fixed the multi select issue where clikcing on one of the shapes will deselect the other
fixed the line bending and the beizer curvature working
fixed the logic of detecting lists inside of table
fixed the problem of adding the texts and editing them
fixed some bugs regarding the h1 tags and the inline items + the code block creation
fixed the bugs of the code block
fixed the issue of code new lines and in lines
fixed the textbox overflowing from the edge of the screens
fixed the icon resize and the rotate and drag of icons
fixed the rotation of the icon and the resize logic to work properly
fixed the viewbox error of the rendered icons
fixed the line to have the better anchors and have a center anchor to bend the line
fixed the zoom level pan adjustment for the transform of the circle
fixed the issue of the option styles for the circle in case of undo redo
fixed the redo and the undo logic for transform in the circle
fixed the code to select the circle while clicking it
fixed residual errors about the undo and redo
fixed the issue of the viewbox zoom

### Other
- renamed the package to use elixpo/lixsearch for npm
- Add source map for engine.bundle.js to improve debugging capabilities
- Remove dependency on @lixsketch/engine from vscode package.json
- Refactor code structure for improved readability and maintainability
- Refactor code structure for improved readability and maintainability
- deploy: v5.2.12
- added zindex control on the lixscript texts
- updated and fixed the bog section and made deploy.sh push t github too
- made a deployment
- added an image pipeline blog


## v4.5.7 (2026-03-21)

### Features
- update package version to 4.5.5, enhance deploy script for npm publishing, and add changelog entries for new features and fixes
- update deploy script to use sudo for npm commands and enhance changelog with version 4.5.4 details
- rename package references from @lixsketch to @elixpo/lixsketch and add LICENSE file
- update package name in package.json and modify .gitignore to include *.vsix
- update package script to exclude dependencies during packaging
- update .vscodeignore to include necessary files for packaging
- add icon.png for LixSketch VS Code extension
- add README.md for LixSketch VS Code extension with usage instructions and features
- add LICENSE file with MIT License terms
- add engine package launch blog post and update navigation links
- add LixSketch VS Code extension with custom editor and toolbar
- enhance SketchEngine with event handling and public API surfaces
- add keybinds (G/U) to image source picker and fix positioning
- add Research Paper tab to AI modal for publication-quality architecture diagrams
- wire shading, label styling, and frame imageURL through AIRenderer and LixScript parser
- massively improve AI system prompts with granular controls and research paper mode
- add image-in-frame via URL support
- add gradient shading support to Rectangle and Circle shapes
- add padded background behind text labels in Rectangle and Circle shapes
- implement quick save functionality with cloud sync and update shortcut descriptions
- implement quick save functionality with cloud sync and update shortcut descriptions
- enhance save status handling with immediate local marking after cloud sync
- enhance save status handling with immediate local marking after cloud sync
- implement user kick functionality and handle notifications for kicked users
- implement user kick functionality and handle notifications for kicked users
- add Canvas Properties modal and integrate save status indicator
- add Canvas Properties modal and integrate save status indicator
- implement save status indicator and enhance auto-save functionality
- implement save status indicator and enhance auto-save functionality
- add InkFlowa v1 showcase section with enhanced visuals and links
- add InkFlowa v1 showcase section with enhanced visuals and links
- update star history section to use timeline for improved visualization
- update star history section to use timeline for improved visualization
- update star history section with responsive image support
- update star history section with responsive image support
- revamp README for clarity and enhanced presentation of features
- revamp README for clarity and enhanced presentation of features
- update deploy script to support multiple command chaining
- update deploy script to support multiple command chaining
- improve workspace handling in auto-save and session ID management
- improve workspace handling in auto-save and session ID management
- enhance session ID management for new workspaces and clean URL handling
- enhance session ID management for new workspaces and clean URL handling
- remove unused router and authentication logic from LandingPage component
- remove unused router and authentication logic from LandingPage component
- refine session ID extraction logic to exclude 'new' segment in URL
- refine session ID extraction logic to exclude 'new' segment in URL
- disable legacy category and search listeners in iconTool for React integration
- disable legacy category and search listeners in iconTool for React integration
- update IconCell styles for improved layout and responsiveness in IconSidebar
- update IconCell styles for improved layout and responsiveness in IconSidebar
- enhance IconSidebar grid layout for better icon display and improve event handling in EventDispatcher and Selection modules
- enhance IconSidebar grid layout for better icon display and improve event handling in EventDispatcher and Selection modules
- update IconSidebar grid layout for improved icon display and adjust icon tool behavior to maintain tool state after placing icons
- update IconSidebar grid layout for improved icon display and adjust icon tool behavior to maintain tool state after placing icons
- enhance HelpModal and Toolbar layout, improve event handling in SketchEngine and EventDispatcher
- enhance HelpModal and Toolbar layout, improve event handling in SketchEngine and EventDispatcher
- update icon layout to use a responsive grid for better display
- update icon layout to use a responsive grid for better display
- add FindBar component and integrate find functionality in canvas and keyboard shortcuts
- add FindBar component and integrate find functionality in canvas and keyboard shortcuts
- improve frame shape handling during serialization and restoration
- improve frame shape handling during serialization and restoration
- enhance shape serialization with fill style, color, grid size, and color options
- enhance shape serialization with fill style, color, grid size, and color options
- add fill style and color options to Frame component
- add fill style and color options to Frame component
- implement context menu for canvas with copy, paste, and shape actions
- implement context menu for canvas with copy, paste, and shape actions
- enhance removeSelection method to clear selection outlines and anchors
- enhance removeSelection method to clear selection outlines and anchors
- enhance authentication flow and improve user experience with session management
- enhance authentication flow and improve user experience with session management
- add AI request limits and usage overview to profile page
- add AI request limits and usage overview to profile page
- implement AI usage tracking and quota management for users and guests
- implement AI usage tracking and quota management for users and guests
- implement workspace limits and tracking for user and guest sessions
- implement workspace limits and tracking for user and guest sessions
- enforce room limit to one per user for better resource management
- enforce room limit to one per user for better resource management
- add auto-open file picker for image tool activation
- add auto-open file picker for image tool activation
- improve IconCell button accessibility and optimize icon fetching logic
- improve IconCell button accessibility and optimize icon fetching logic
- refactor resizing logic for Frame, Rectangle, Icon, and Image tools to improve rotation handling and maintain aspect ratio
- refactor resizing logic for Frame, Rectangle, Icon, and Image tools to improve rotation handling and maintain aspect ratio
- enhance pricing page visuals with improved dot grid opacity, margin doodle colors, and ambient glow effects
- enhance pricing page visuals with improved dot grid opacity, margin doodle colors, and ambient glow effects
- enhance pricing page with animated price display, ambient glow effects, and margin doodles; improve UI responsiveness and visual appeal
- enhance pricing page with animated price display, ambient glow effects, and margin doodles; improve UI responsiveness and visual appeal
- implement pricing page with plan details, toggle for monthly/annual billing, and enhanced UI components
- implement pricing page with plan details, toggle for monthly/annual billing, and enhanced UI components
- enhance SaveModal with export options for PNG, SVG, and PDF; improve preview generation and UI layout
- enhance SaveModal with export options for PNG, SVG, and PDF; improve preview generation and UI layout
- enhance deploy script with D1 and KV binding IDs for Cloudflare Pages deployment
- enhance deploy script with D1 and KV binding IDs for Cloudflare Pages deployment
- implement scene deletion API endpoint and integrate with SaveModal for revoking shared links
- implement scene deletion API endpoint and integrate with SaveModal for revoking shared links
- implement RoadmapPage with timeline sections for shipped, in-progress, and planned features, including interactive elements and visual enhancements
- implement RoadmapPage with timeline sections for shipped, in-progress, and planned features, including interactive elements and visual enhancements
- enhance RoughLixScriptCanvas with label background cutout effect and refactor label drawing logic + custom scrollbar for the global css
- enhance RoughLixScriptCanvas with label background cutout effect and refactor label drawing logic + custom scrollbar for the global css
- add RoughLixScriptCanvas component for enhanced LixScript rendering and update LixScriptParser to export resolveShapeRefs function
- add RoughLixScriptCanvas component for enhanced LixScript rendering and update LixScriptParser to export resolveShapeRefs function
- implement CommunityPage with interactive elements and Markdown content
- implement CommunityPage with interactive elements and Markdown content
- Replace Coming Soon pages with CanvasPageLayout for Use Cases, Roadmap, and Teams
- Replace Coming Soon pages with CanvasPageLayout for Use Cases, Roadmap, and Teams
- enhance BlogPostPage and MarkdownRenderer with RoughJS elements for improved visual styling
- enhance BlogPostPage and MarkdownRenderer with RoughJS elements for improved visual styling
- implement WebGL particle constellation and enhance animation effects on landing page
- implement WebGL particle constellation and enhance animation effects on landing page
- refactor environment variable handling for collaboration and worker URLs
- refactor environment variable handling for collaboration and worker URLs
- add 'edge' runtime export to multiple API routes and layouts
- add 'edge' runtime export to multiple API routes and layouts
- add logo click functionality to reload or navigate to home
- add logo click functionality to reload or navigate to home
- enhance BlogPostPage and MarkdownRenderer with improved styling and functionality
- enhance BlogPostPage and MarkdownRenderer with improved styling and functionality
- enhance documentation and UI components
- enhance documentation and UI components
- Implement Coming Soon pages for Pricing, Blog, Community, How to Start, Security, Use Cases, and Roadmap
- Implement Coming Soon pages for Pricing, Blog, Community, How to Start, Security, Use Cases, and Roadmap
- add framer-motion for animations and update package dependencies
- add framer-motion for animations and update package dependencies
- Implement auto-save functionality and enhance AppMenu and HelpModal with documentation links
- Implement auto-save functionality and enhance AppMenu and HelpModal with documentation links
- Update LixScript specifications and examples for improved clarity and consistency
- Update LixScript specifications and examples for improved clarity and consistency
- Enhance LixScript LLM specification and improve diagram generation instructions
- Enhance LixScript LLM specification and improve diagram generation instructions
- Update LixScript LLM model and enhance specification details
- Update LixScript LLM model and enhance specification details
- Add LixScript documentation page and LLM specification
- Add LixScript documentation page and LLM specification
- implement deploy script for Cloudflare Worker with upload, build, and migration commands
- implement deploy script for Cloudflare Worker with upload, build, and migration commands
- add LixScriptParser for parsing and rendering LixScript diagrams
- add LixScriptParser for parsing and rendering LixScript diagrams
- **api**: add image signing and scene management endpoints
- **api**: add image signing and scene management endpoints
- Implement collaboration feature with WebSocket support and user presence tracking
- Implement collaboration feature with WebSocket support and user presence tracking
- Add live collaboration feature with shareable link and error handling
- Add live collaboration feature with shareable link and error handling
- Refactor OAuth callback handling and improve error logging
- Refactor OAuth callback handling and improve error logging
- Update workspace name handling to initialize from localStorage and allow empty names
- Update workspace name handling to initialize from localStorage and allow empty names
- Add workspace name parameter to room initialization and database insertion
- Add workspace name parameter to room initialization and database insertion
- Implement OAuth callback handling with token exchange and user profile fetching
- Implement OAuth callback handling with token exchange and user profile fetching
- Enhance selection controls for Arrow, Circle, Line, and Rectangle shapes
- Enhance selection controls for Arrow, Circle, Line, and Rectangle shapes
- Implement shared scene loading with encryption and error handling
- Implement shared scene loading with encryption and error handling
- Integrate authentication state in Home, Header, and AppMenu components
- Integrate authentication state in Home, Header, and AppMenu components
- Implement OAuth authentication flow with session management and user state handling
- Implement OAuth authentication flow with session management and user state handling
- Add authentication and session management routes with OAuth integration
- Add authentication and session management routes with OAuth integration
- Implement RoomDurableObject for real-time collaboration and add REST API for scene management
- Implement RoomDurableObject for real-time collaboration and add REST API for scene management
- Add multi-selection frame actions and UI component
- Add multi-selection frame actions and UI component
- Add Sign In button to AppMenu with hover effect
- Implement session management and E2E encryption; add shareable link functionality and workspace name generation
- Enhance header and menu components for zen mode support; add tool lock functionality in toolbar
- Implement view and zen modes with corresponding UI adjustments and keyboard shortcuts
- Add Export Image functionality with modal and keyboard shortcuts support
- Enhance AppMenu and CommandPalette with action support and improved command handling
- Add Command Palette and Help Modal with keyboard shortcuts support
- **Line**: Support dashed and dotted lines with plain SVG rendering
- **MermaidFlowchartRenderer**: Add fill, stroke, and strokeWidth properties to node rendering
- **AIModal**: Add side-by-side live preview for Mermaid diagrams with error handling
- **AIModal**: Enhance Mermaid diagram support with unified parser and renderer feat(FrameSidebar): Update frame type detection for AI editing feat(AIRenderer): Implement lazy-loading for sequence diagram rendering feat(MermaidSequenceParser): Add parser for Mermaid sequence diagrams feat(MermaidSequenceRenderer): Create renderer for high-quality SVG sequence diagrams
- **AIModal**: Refactor header and improve layout for better usability
- **graph-engine**: Implement Graph Engine for rendering mathematical graphs
- add invisible backdrop to close menu on outside click
- add keyboard shortcuts for deleting selected shapes and cleanup attachments
- add grid functionality with toggle and keyboard shortcut support
- implement eraser trail cleanup on tool switch and improve trail rendering
- add custom cursor for laser tool

### Fixes
- update version to 4.2.3 and correct author information in package.json
- update import paths for engine modules in route.js and MarkdownRenderer.jsx
fixed image rendeinf in frame and standalone in the image based blogs and also fixed the issue of the cured arrows not showing up
fixed the blog and the image rendering urls
fixing the load from localstorage interactivty in the canvas
fixed the errors of isNearAnchor
fixed the modal for the image generation with mode details
fixed the image edit and other image generation factors
fixed the deploy.sh to ignore the git version
fixed the deploy.sh to ignore the git version
- update image source picker text and remove auto-open file picker logic
- remove unnecessary closing brace in useAutoSave function
- remove unnecessary closing brace in useAutoSave function
- enhance destroy method to properly handle contained shapes in diagram frames
- enhance destroy method to properly handle contained shapes in diagram frames
- correct spelling of InkFlowa to InkFlow in landing page
- correct spelling of InkFlowa to InkFlow in landing page
- update used workspaces calculation in UsageBar component
- update used workspaces calculation in UsageBar component
- update secrets upload command to include both Worker and Pages, and improve usage documentation
- update secrets upload command to include both Worker and Pages, and improve usage documentation
- update button labels in SaveModal for clarity and consistency
- update button labels in SaveModal for clarity and consistency
- update SITE_DESCRIPTION to remove reference to Eraser.io
- update SITE_DESCRIPTION to remove reference to Eraser.io
- update deploy script to use sudo for wrangler commands and remove unnecessary cleanup step
- update deploy script to use sudo for wrangler commands and remove unnecessary cleanup step
- update next dependency version to 15.5.2 for security improvements
- update next dependency version to 15.5.2 for security improvements
- Prevent menu closing when clicking on preferences submenu
- Prevent menu closing when clicking on preferences submenu
- Update serializer method calls to use new save and load functions
- Update serializer method calls to use new save and load functions
- Optimize session ID URL handling to preserve query parameters and hash
- Optimize session ID URL handling to preserve query parameters and hash
- Update OAuth login to use environment variable for clientId and redirectUri
- Update OAuth login to use environment variable for clientId and redirectUri
- Update WORKER_URL and clientId to use environment variables for OAuth flow
- Update WORKER_URL and clientId to use environment variables for OAuth flow
- Update database commands in package.json for consistency
- Update database commands in package.json for consistency
- Add 'plans/' directory to .gitignore
- Add 'plans/' directory to .gitignore
- Limit AppMenu height and enable scrolling for long content
- Limit AppMenu height and enable scrolling for long content
- update laser tool cursor SVG for improved visibility and styling
fixed the text tool to show propety pannel
fixed the selection recangle to of the circle and rectangle
fixed memory leak and the big were the element checks cache for the regeneration
fixed the anchor of the line from disappering
fixed rectangles, text inside frames and text box zoom adjustment , fixed system prompt for word spacng and the coordinate mismatcj
fixed the stray selectionrectangle being persistent and the texttool bug fixes, frame tool text based interaction
fixed the bugs of the frame and the selection of the frame and updated the shortcut of ctrl  + a
fixed rendering issue and applied direct parser for mermaid
fixed the tool deselection and zoom feature
fixed the ndefined reference and the imports + arrow styles of arrow
fixed the eraser being non functional
fixed the fill style icons
fixed the canvas interaction issue
fixing undefined global variables
fixed icons ont he toolbar
fixed interception of the ctrl + scrol
fixed the syntax error for }
fixed the constnt declaration errro
fixed all the dir level imports at the ./ for all the .js files
fixed the ctrl + s trigger on the save dialogue box
fixed the eraser deselect all mechanism
fixed the look of the canvastoolbar
fixed the eraser trail cause of the zoom and the mouse over and also the selection with the event listerners
fixed the multi select issue where clikcing on one of the shapes will deselect the other
fixed the line bending and the beizer curvature working
fixed the logic of detecting lists inside of table
fixed the problem of adding the texts and editing them
fixed some bugs regarding the h1 tags and the inline items + the code block creation
fixed the bugs of the code block
fixed the issue of code new lines and in lines
fixed the textbox overflowing from the edge of the screens
fixed the icon resize and the rotate and drag of icons
fixed the rotation of the icon and the resize logic to work properly
fixed the viewbox error of the rendered icons
fixed the line to have the better anchors and have a center anchor to bend the line
fixed the zoom level pan adjustment for the transform of the circle
fixed the issue of the option styles for the circle in case of undo redo
fixed the redo and the undo logic for transform in the circle
fixed the code to select the circle while clicking it
fixed residual errors about the undo and redo
fixed the issue of the viewbox zoom

### Other
- renamed the package to use elixpo/lixsearch for npm
- Add source map for engine.bundle.js to improve debugging capabilities
- Remove dependency on @lixsketch/engine from vscode package.json
- Refactor code structure for improved readability and maintainability
- Refactor code structure for improved readability and maintainability
- deploy: v5.2.12
- added zindex control on the lixscript texts
- updated and fixed the bog section and made deploy.sh push t github too
- made a deployment
- added an image pipeline blog


## v4.5.6 (2026-03-21)

### Features
- update package version to 4.5.5, enhance deploy script for npm publishing, and add changelog entries for new features and fixes
- update deploy script to use sudo for npm commands and enhance changelog with version 4.5.4 details
- rename package references from @lixsketch to @elixpo/lixsketch and add LICENSE file
- update package name in package.json and modify .gitignore to include *.vsix
- update package script to exclude dependencies during packaging
- update .vscodeignore to include necessary files for packaging
- add icon.png for LixSketch VS Code extension
- add README.md for LixSketch VS Code extension with usage instructions and features
- add LICENSE file with MIT License terms
- add engine package launch blog post and update navigation links
- add LixSketch VS Code extension with custom editor and toolbar
- enhance SketchEngine with event handling and public API surfaces
- add keybinds (G/U) to image source picker and fix positioning
- add Research Paper tab to AI modal for publication-quality architecture diagrams
- wire shading, label styling, and frame imageURL through AIRenderer and LixScript parser
- massively improve AI system prompts with granular controls and research paper mode
- add image-in-frame via URL support
- add gradient shading support to Rectangle and Circle shapes
- add padded background behind text labels in Rectangle and Circle shapes
- implement quick save functionality with cloud sync and update shortcut descriptions
- implement quick save functionality with cloud sync and update shortcut descriptions
- enhance save status handling with immediate local marking after cloud sync
- enhance save status handling with immediate local marking after cloud sync
- implement user kick functionality and handle notifications for kicked users
- implement user kick functionality and handle notifications for kicked users
- add Canvas Properties modal and integrate save status indicator
- add Canvas Properties modal and integrate save status indicator
- implement save status indicator and enhance auto-save functionality
- implement save status indicator and enhance auto-save functionality
- add InkFlowa v1 showcase section with enhanced visuals and links
- add InkFlowa v1 showcase section with enhanced visuals and links
- update star history section to use timeline for improved visualization
- update star history section to use timeline for improved visualization
- update star history section with responsive image support
- update star history section with responsive image support
- revamp README for clarity and enhanced presentation of features
- revamp README for clarity and enhanced presentation of features
- update deploy script to support multiple command chaining
- update deploy script to support multiple command chaining
- improve workspace handling in auto-save and session ID management
- improve workspace handling in auto-save and session ID management
- enhance session ID management for new workspaces and clean URL handling
- enhance session ID management for new workspaces and clean URL handling
- remove unused router and authentication logic from LandingPage component
- remove unused router and authentication logic from LandingPage component
- refine session ID extraction logic to exclude 'new' segment in URL
- refine session ID extraction logic to exclude 'new' segment in URL
- disable legacy category and search listeners in iconTool for React integration
- disable legacy category and search listeners in iconTool for React integration
- update IconCell styles for improved layout and responsiveness in IconSidebar
- update IconCell styles for improved layout and responsiveness in IconSidebar
- enhance IconSidebar grid layout for better icon display and improve event handling in EventDispatcher and Selection modules
- enhance IconSidebar grid layout for better icon display and improve event handling in EventDispatcher and Selection modules
- update IconSidebar grid layout for improved icon display and adjust icon tool behavior to maintain tool state after placing icons
- update IconSidebar grid layout for improved icon display and adjust icon tool behavior to maintain tool state after placing icons
- enhance HelpModal and Toolbar layout, improve event handling in SketchEngine and EventDispatcher
- enhance HelpModal and Toolbar layout, improve event handling in SketchEngine and EventDispatcher
- update icon layout to use a responsive grid for better display
- update icon layout to use a responsive grid for better display
- add FindBar component and integrate find functionality in canvas and keyboard shortcuts
- add FindBar component and integrate find functionality in canvas and keyboard shortcuts
- improve frame shape handling during serialization and restoration
- improve frame shape handling during serialization and restoration
- enhance shape serialization with fill style, color, grid size, and color options
- enhance shape serialization with fill style, color, grid size, and color options
- add fill style and color options to Frame component
- add fill style and color options to Frame component
- implement context menu for canvas with copy, paste, and shape actions
- implement context menu for canvas with copy, paste, and shape actions
- enhance removeSelection method to clear selection outlines and anchors
- enhance removeSelection method to clear selection outlines and anchors
- enhance authentication flow and improve user experience with session management
- enhance authentication flow and improve user experience with session management
- add AI request limits and usage overview to profile page
- add AI request limits and usage overview to profile page
- implement AI usage tracking and quota management for users and guests
- implement AI usage tracking and quota management for users and guests
- implement workspace limits and tracking for user and guest sessions
- implement workspace limits and tracking for user and guest sessions
- enforce room limit to one per user for better resource management
- enforce room limit to one per user for better resource management
- add auto-open file picker for image tool activation
- add auto-open file picker for image tool activation
- improve IconCell button accessibility and optimize icon fetching logic
- improve IconCell button accessibility and optimize icon fetching logic
- refactor resizing logic for Frame, Rectangle, Icon, and Image tools to improve rotation handling and maintain aspect ratio
- refactor resizing logic for Frame, Rectangle, Icon, and Image tools to improve rotation handling and maintain aspect ratio
- enhance pricing page visuals with improved dot grid opacity, margin doodle colors, and ambient glow effects
- enhance pricing page visuals with improved dot grid opacity, margin doodle colors, and ambient glow effects
- enhance pricing page with animated price display, ambient glow effects, and margin doodles; improve UI responsiveness and visual appeal
- enhance pricing page with animated price display, ambient glow effects, and margin doodles; improve UI responsiveness and visual appeal
- implement pricing page with plan details, toggle for monthly/annual billing, and enhanced UI components
- implement pricing page with plan details, toggle for monthly/annual billing, and enhanced UI components
- enhance SaveModal with export options for PNG, SVG, and PDF; improve preview generation and UI layout
- enhance SaveModal with export options for PNG, SVG, and PDF; improve preview generation and UI layout
- enhance deploy script with D1 and KV binding IDs for Cloudflare Pages deployment
- enhance deploy script with D1 and KV binding IDs for Cloudflare Pages deployment
- implement scene deletion API endpoint and integrate with SaveModal for revoking shared links
- implement scene deletion API endpoint and integrate with SaveModal for revoking shared links
- implement RoadmapPage with timeline sections for shipped, in-progress, and planned features, including interactive elements and visual enhancements
- implement RoadmapPage with timeline sections for shipped, in-progress, and planned features, including interactive elements and visual enhancements
- enhance RoughLixScriptCanvas with label background cutout effect and refactor label drawing logic + custom scrollbar for the global css
- enhance RoughLixScriptCanvas with label background cutout effect and refactor label drawing logic + custom scrollbar for the global css
- add RoughLixScriptCanvas component for enhanced LixScript rendering and update LixScriptParser to export resolveShapeRefs function
- add RoughLixScriptCanvas component for enhanced LixScript rendering and update LixScriptParser to export resolveShapeRefs function
- implement CommunityPage with interactive elements and Markdown content
- implement CommunityPage with interactive elements and Markdown content
- Replace Coming Soon pages with CanvasPageLayout for Use Cases, Roadmap, and Teams
- Replace Coming Soon pages with CanvasPageLayout for Use Cases, Roadmap, and Teams
- enhance BlogPostPage and MarkdownRenderer with RoughJS elements for improved visual styling
- enhance BlogPostPage and MarkdownRenderer with RoughJS elements for improved visual styling
- implement WebGL particle constellation and enhance animation effects on landing page
- implement WebGL particle constellation and enhance animation effects on landing page
- refactor environment variable handling for collaboration and worker URLs
- refactor environment variable handling for collaboration and worker URLs
- add 'edge' runtime export to multiple API routes and layouts
- add 'edge' runtime export to multiple API routes and layouts
- add logo click functionality to reload or navigate to home
- add logo click functionality to reload or navigate to home
- enhance BlogPostPage and MarkdownRenderer with improved styling and functionality
- enhance BlogPostPage and MarkdownRenderer with improved styling and functionality
- enhance documentation and UI components
- enhance documentation and UI components
- Implement Coming Soon pages for Pricing, Blog, Community, How to Start, Security, Use Cases, and Roadmap
- Implement Coming Soon pages for Pricing, Blog, Community, How to Start, Security, Use Cases, and Roadmap
- add framer-motion for animations and update package dependencies
- add framer-motion for animations and update package dependencies
- Implement auto-save functionality and enhance AppMenu and HelpModal with documentation links
- Implement auto-save functionality and enhance AppMenu and HelpModal with documentation links
- Update LixScript specifications and examples for improved clarity and consistency
- Update LixScript specifications and examples for improved clarity and consistency
- Enhance LixScript LLM specification and improve diagram generation instructions
- Enhance LixScript LLM specification and improve diagram generation instructions
- Update LixScript LLM model and enhance specification details
- Update LixScript LLM model and enhance specification details
- Add LixScript documentation page and LLM specification
- Add LixScript documentation page and LLM specification
- implement deploy script for Cloudflare Worker with upload, build, and migration commands
- implement deploy script for Cloudflare Worker with upload, build, and migration commands
- add LixScriptParser for parsing and rendering LixScript diagrams
- add LixScriptParser for parsing and rendering LixScript diagrams
- **api**: add image signing and scene management endpoints
- **api**: add image signing and scene management endpoints
- Implement collaboration feature with WebSocket support and user presence tracking
- Implement collaboration feature with WebSocket support and user presence tracking
- Add live collaboration feature with shareable link and error handling
- Add live collaboration feature with shareable link and error handling
- Refactor OAuth callback handling and improve error logging
- Refactor OAuth callback handling and improve error logging
- Update workspace name handling to initialize from localStorage and allow empty names
- Update workspace name handling to initialize from localStorage and allow empty names
- Add workspace name parameter to room initialization and database insertion
- Add workspace name parameter to room initialization and database insertion
- Implement OAuth callback handling with token exchange and user profile fetching
- Implement OAuth callback handling with token exchange and user profile fetching
- Enhance selection controls for Arrow, Circle, Line, and Rectangle shapes
- Enhance selection controls for Arrow, Circle, Line, and Rectangle shapes
- Implement shared scene loading with encryption and error handling
- Implement shared scene loading with encryption and error handling
- Integrate authentication state in Home, Header, and AppMenu components
- Integrate authentication state in Home, Header, and AppMenu components
- Implement OAuth authentication flow with session management and user state handling
- Implement OAuth authentication flow with session management and user state handling
- Add authentication and session management routes with OAuth integration
- Add authentication and session management routes with OAuth integration
- Implement RoomDurableObject for real-time collaboration and add REST API for scene management
- Implement RoomDurableObject for real-time collaboration and add REST API for scene management
- Add multi-selection frame actions and UI component
- Add multi-selection frame actions and UI component
- Add Sign In button to AppMenu with hover effect
- Implement session management and E2E encryption; add shareable link functionality and workspace name generation
- Enhance header and menu components for zen mode support; add tool lock functionality in toolbar
- Implement view and zen modes with corresponding UI adjustments and keyboard shortcuts
- Add Export Image functionality with modal and keyboard shortcuts support
- Enhance AppMenu and CommandPalette with action support and improved command handling
- Add Command Palette and Help Modal with keyboard shortcuts support
- **Line**: Support dashed and dotted lines with plain SVG rendering
- **MermaidFlowchartRenderer**: Add fill, stroke, and strokeWidth properties to node rendering
- **AIModal**: Add side-by-side live preview for Mermaid diagrams with error handling
- **AIModal**: Enhance Mermaid diagram support with unified parser and renderer feat(FrameSidebar): Update frame type detection for AI editing feat(AIRenderer): Implement lazy-loading for sequence diagram rendering feat(MermaidSequenceParser): Add parser for Mermaid sequence diagrams feat(MermaidSequenceRenderer): Create renderer for high-quality SVG sequence diagrams
- **AIModal**: Refactor header and improve layout for better usability
- **graph-engine**: Implement Graph Engine for rendering mathematical graphs
- add invisible backdrop to close menu on outside click
- add keyboard shortcuts for deleting selected shapes and cleanup attachments
- add grid functionality with toggle and keyboard shortcut support
- implement eraser trail cleanup on tool switch and improve trail rendering
- add custom cursor for laser tool

### Fixes
- update version to 4.2.3 and correct author information in package.json
- update import paths for engine modules in route.js and MarkdownRenderer.jsx
fixed image rendeinf in frame and standalone in the image based blogs and also fixed the issue of the cured arrows not showing up
fixed the blog and the image rendering urls
fixing the load from localstorage interactivty in the canvas
fixed the errors of isNearAnchor
fixed the modal for the image generation with mode details
fixed the image edit and other image generation factors
fixed the deploy.sh to ignore the git version
fixed the deploy.sh to ignore the git version
- update image source picker text and remove auto-open file picker logic
- remove unnecessary closing brace in useAutoSave function
- remove unnecessary closing brace in useAutoSave function
- enhance destroy method to properly handle contained shapes in diagram frames
- enhance destroy method to properly handle contained shapes in diagram frames
- correct spelling of InkFlowa to InkFlow in landing page
- correct spelling of InkFlowa to InkFlow in landing page
- update used workspaces calculation in UsageBar component
- update used workspaces calculation in UsageBar component
- update secrets upload command to include both Worker and Pages, and improve usage documentation
- update secrets upload command to include both Worker and Pages, and improve usage documentation
- update button labels in SaveModal for clarity and consistency
- update button labels in SaveModal for clarity and consistency
- update SITE_DESCRIPTION to remove reference to Eraser.io
- update SITE_DESCRIPTION to remove reference to Eraser.io
- update deploy script to use sudo for wrangler commands and remove unnecessary cleanup step
- update deploy script to use sudo for wrangler commands and remove unnecessary cleanup step
- update next dependency version to 15.5.2 for security improvements
- update next dependency version to 15.5.2 for security improvements
- Prevent menu closing when clicking on preferences submenu
- Prevent menu closing when clicking on preferences submenu
- Update serializer method calls to use new save and load functions
- Update serializer method calls to use new save and load functions
- Optimize session ID URL handling to preserve query parameters and hash
- Optimize session ID URL handling to preserve query parameters and hash
- Update OAuth login to use environment variable for clientId and redirectUri
- Update OAuth login to use environment variable for clientId and redirectUri
- Update WORKER_URL and clientId to use environment variables for OAuth flow
- Update WORKER_URL and clientId to use environment variables for OAuth flow
- Update database commands in package.json for consistency
- Update database commands in package.json for consistency
- Add 'plans/' directory to .gitignore
- Add 'plans/' directory to .gitignore
- Limit AppMenu height and enable scrolling for long content
- Limit AppMenu height and enable scrolling for long content
- update laser tool cursor SVG for improved visibility and styling
fixed the text tool to show propety pannel
fixed the selection recangle to of the circle and rectangle
fixed memory leak and the big were the element checks cache for the regeneration
fixed the anchor of the line from disappering
fixed rectangles, text inside frames and text box zoom adjustment , fixed system prompt for word spacng and the coordinate mismatcj
fixed the stray selectionrectangle being persistent and the texttool bug fixes, frame tool text based interaction
fixed the bugs of the frame and the selection of the frame and updated the shortcut of ctrl  + a
fixed rendering issue and applied direct parser for mermaid
fixed the tool deselection and zoom feature
fixed the ndefined reference and the imports + arrow styles of arrow
fixed the eraser being non functional
fixed the fill style icons
fixed the canvas interaction issue
fixing undefined global variables
fixed icons ont he toolbar
fixed interception of the ctrl + scrol
fixed the syntax error for }
fixed the constnt declaration errro
fixed all the dir level imports at the ./ for all the .js files
fixed the ctrl + s trigger on the save dialogue box
fixed the eraser deselect all mechanism
fixed the look of the canvastoolbar
fixed the eraser trail cause of the zoom and the mouse over and also the selection with the event listerners
fixed the multi select issue where clikcing on one of the shapes will deselect the other
fixed the line bending and the beizer curvature working
fixed the logic of detecting lists inside of table
fixed the problem of adding the texts and editing them
fixed some bugs regarding the h1 tags and the inline items + the code block creation
fixed the bugs of the code block
fixed the issue of code new lines and in lines
fixed the textbox overflowing from the edge of the screens
fixed the icon resize and the rotate and drag of icons
fixed the rotation of the icon and the resize logic to work properly
fixed the viewbox error of the rendered icons
fixed the line to have the better anchors and have a center anchor to bend the line
fixed the zoom level pan adjustment for the transform of the circle
fixed the issue of the option styles for the circle in case of undo redo
fixed the redo and the undo logic for transform in the circle
fixed the code to select the circle while clicking it
fixed residual errors about the undo and redo
fixed the issue of the viewbox zoom

### Other
- renamed the package to use elixpo/lixsearch for npm
- Add source map for engine.bundle.js to improve debugging capabilities
- Remove dependency on @lixsketch/engine from vscode package.json
- Refactor code structure for improved readability and maintainability
- Refactor code structure for improved readability and maintainability
- deploy: v5.2.12
- added zindex control on the lixscript texts
- updated and fixed the bog section and made deploy.sh push t github too
- made a deployment
- added an image pipeline blog


## v4.5.5 (2026-03-21)

### Features
- update deploy script to use sudo for npm commands and enhance changelog with version 4.5.4 details
- rename package references from @lixsketch to @elixpo/lixsketch and add LICENSE file
- update package name in package.json and modify .gitignore to include *.vsix
- update package script to exclude dependencies during packaging
- update .vscodeignore to include necessary files for packaging
- add icon.png for LixSketch VS Code extension
- add README.md for LixSketch VS Code extension with usage instructions and features
- add LICENSE file with MIT License terms
- add engine package launch blog post and update navigation links
- add LixSketch VS Code extension with custom editor and toolbar
- enhance SketchEngine with event handling and public API surfaces
- add keybinds (G/U) to image source picker and fix positioning
- add Research Paper tab to AI modal for publication-quality architecture diagrams
- wire shading, label styling, and frame imageURL through AIRenderer and LixScript parser
- massively improve AI system prompts with granular controls and research paper mode
- add image-in-frame via URL support
- add gradient shading support to Rectangle and Circle shapes
- add padded background behind text labels in Rectangle and Circle shapes
- implement quick save functionality with cloud sync and update shortcut descriptions
- implement quick save functionality with cloud sync and update shortcut descriptions
- enhance save status handling with immediate local marking after cloud sync
- enhance save status handling with immediate local marking after cloud sync
- implement user kick functionality and handle notifications for kicked users
- implement user kick functionality and handle notifications for kicked users
- add Canvas Properties modal and integrate save status indicator
- add Canvas Properties modal and integrate save status indicator
- implement save status indicator and enhance auto-save functionality
- implement save status indicator and enhance auto-save functionality
- add InkFlowa v1 showcase section with enhanced visuals and links
- add InkFlowa v1 showcase section with enhanced visuals and links
- update star history section to use timeline for improved visualization
- update star history section to use timeline for improved visualization
- update star history section with responsive image support
- update star history section with responsive image support
- revamp README for clarity and enhanced presentation of features
- revamp README for clarity and enhanced presentation of features
- update deploy script to support multiple command chaining
- update deploy script to support multiple command chaining
- improve workspace handling in auto-save and session ID management
- improve workspace handling in auto-save and session ID management
- enhance session ID management for new workspaces and clean URL handling
- enhance session ID management for new workspaces and clean URL handling
- remove unused router and authentication logic from LandingPage component
- remove unused router and authentication logic from LandingPage component
- refine session ID extraction logic to exclude 'new' segment in URL
- refine session ID extraction logic to exclude 'new' segment in URL
- disable legacy category and search listeners in iconTool for React integration
- disable legacy category and search listeners in iconTool for React integration
- update IconCell styles for improved layout and responsiveness in IconSidebar
- update IconCell styles for improved layout and responsiveness in IconSidebar
- enhance IconSidebar grid layout for better icon display and improve event handling in EventDispatcher and Selection modules
- enhance IconSidebar grid layout for better icon display and improve event handling in EventDispatcher and Selection modules
- update IconSidebar grid layout for improved icon display and adjust icon tool behavior to maintain tool state after placing icons
- update IconSidebar grid layout for improved icon display and adjust icon tool behavior to maintain tool state after placing icons
- enhance HelpModal and Toolbar layout, improve event handling in SketchEngine and EventDispatcher
- enhance HelpModal and Toolbar layout, improve event handling in SketchEngine and EventDispatcher
- update icon layout to use a responsive grid for better display
- update icon layout to use a responsive grid for better display
- add FindBar component and integrate find functionality in canvas and keyboard shortcuts
- add FindBar component and integrate find functionality in canvas and keyboard shortcuts
- improve frame shape handling during serialization and restoration
- improve frame shape handling during serialization and restoration
- enhance shape serialization with fill style, color, grid size, and color options
- enhance shape serialization with fill style, color, grid size, and color options
- add fill style and color options to Frame component
- add fill style and color options to Frame component
- implement context menu for canvas with copy, paste, and shape actions
- implement context menu for canvas with copy, paste, and shape actions
- enhance removeSelection method to clear selection outlines and anchors
- enhance removeSelection method to clear selection outlines and anchors
- enhance authentication flow and improve user experience with session management
- enhance authentication flow and improve user experience with session management
- add AI request limits and usage overview to profile page
- add AI request limits and usage overview to profile page
- implement AI usage tracking and quota management for users and guests
- implement AI usage tracking and quota management for users and guests
- implement workspace limits and tracking for user and guest sessions
- implement workspace limits and tracking for user and guest sessions
- enforce room limit to one per user for better resource management
- enforce room limit to one per user for better resource management
- add auto-open file picker for image tool activation
- add auto-open file picker for image tool activation
- improve IconCell button accessibility and optimize icon fetching logic
- improve IconCell button accessibility and optimize icon fetching logic
- refactor resizing logic for Frame, Rectangle, Icon, and Image tools to improve rotation handling and maintain aspect ratio
- refactor resizing logic for Frame, Rectangle, Icon, and Image tools to improve rotation handling and maintain aspect ratio
- enhance pricing page visuals with improved dot grid opacity, margin doodle colors, and ambient glow effects
- enhance pricing page visuals with improved dot grid opacity, margin doodle colors, and ambient glow effects
- enhance pricing page with animated price display, ambient glow effects, and margin doodles; improve UI responsiveness and visual appeal
- enhance pricing page with animated price display, ambient glow effects, and margin doodles; improve UI responsiveness and visual appeal
- implement pricing page with plan details, toggle for monthly/annual billing, and enhanced UI components
- implement pricing page with plan details, toggle for monthly/annual billing, and enhanced UI components
- enhance SaveModal with export options for PNG, SVG, and PDF; improve preview generation and UI layout
- enhance SaveModal with export options for PNG, SVG, and PDF; improve preview generation and UI layout
- enhance deploy script with D1 and KV binding IDs for Cloudflare Pages deployment
- enhance deploy script with D1 and KV binding IDs for Cloudflare Pages deployment
- implement scene deletion API endpoint and integrate with SaveModal for revoking shared links
- implement scene deletion API endpoint and integrate with SaveModal for revoking shared links
- implement RoadmapPage with timeline sections for shipped, in-progress, and planned features, including interactive elements and visual enhancements
- implement RoadmapPage with timeline sections for shipped, in-progress, and planned features, including interactive elements and visual enhancements
- enhance RoughLixScriptCanvas with label background cutout effect and refactor label drawing logic + custom scrollbar for the global css
- enhance RoughLixScriptCanvas with label background cutout effect and refactor label drawing logic + custom scrollbar for the global css
- add RoughLixScriptCanvas component for enhanced LixScript rendering and update LixScriptParser to export resolveShapeRefs function
- add RoughLixScriptCanvas component for enhanced LixScript rendering and update LixScriptParser to export resolveShapeRefs function
- implement CommunityPage with interactive elements and Markdown content
- implement CommunityPage with interactive elements and Markdown content
- Replace Coming Soon pages with CanvasPageLayout for Use Cases, Roadmap, and Teams
- Replace Coming Soon pages with CanvasPageLayout for Use Cases, Roadmap, and Teams
- enhance BlogPostPage and MarkdownRenderer with RoughJS elements for improved visual styling
- enhance BlogPostPage and MarkdownRenderer with RoughJS elements for improved visual styling
- implement WebGL particle constellation and enhance animation effects on landing page
- implement WebGL particle constellation and enhance animation effects on landing page
- refactor environment variable handling for collaboration and worker URLs
- refactor environment variable handling for collaboration and worker URLs
- add 'edge' runtime export to multiple API routes and layouts
- add 'edge' runtime export to multiple API routes and layouts
- add logo click functionality to reload or navigate to home
- add logo click functionality to reload or navigate to home
- enhance BlogPostPage and MarkdownRenderer with improved styling and functionality
- enhance BlogPostPage and MarkdownRenderer with improved styling and functionality
- enhance documentation and UI components
- enhance documentation and UI components
- Implement Coming Soon pages for Pricing, Blog, Community, How to Start, Security, Use Cases, and Roadmap
- Implement Coming Soon pages for Pricing, Blog, Community, How to Start, Security, Use Cases, and Roadmap
- add framer-motion for animations and update package dependencies
- add framer-motion for animations and update package dependencies
- Implement auto-save functionality and enhance AppMenu and HelpModal with documentation links
- Implement auto-save functionality and enhance AppMenu and HelpModal with documentation links
- Update LixScript specifications and examples for improved clarity and consistency
- Update LixScript specifications and examples for improved clarity and consistency
- Enhance LixScript LLM specification and improve diagram generation instructions
- Enhance LixScript LLM specification and improve diagram generation instructions
- Update LixScript LLM model and enhance specification details
- Update LixScript LLM model and enhance specification details
- Add LixScript documentation page and LLM specification
- Add LixScript documentation page and LLM specification
- implement deploy script for Cloudflare Worker with upload, build, and migration commands
- implement deploy script for Cloudflare Worker with upload, build, and migration commands
- add LixScriptParser for parsing and rendering LixScript diagrams
- add LixScriptParser for parsing and rendering LixScript diagrams
- **api**: add image signing and scene management endpoints
- **api**: add image signing and scene management endpoints
- Implement collaboration feature with WebSocket support and user presence tracking
- Implement collaboration feature with WebSocket support and user presence tracking
- Add live collaboration feature with shareable link and error handling
- Add live collaboration feature with shareable link and error handling
- Refactor OAuth callback handling and improve error logging
- Refactor OAuth callback handling and improve error logging
- Update workspace name handling to initialize from localStorage and allow empty names
- Update workspace name handling to initialize from localStorage and allow empty names
- Add workspace name parameter to room initialization and database insertion
- Add workspace name parameter to room initialization and database insertion
- Implement OAuth callback handling with token exchange and user profile fetching
- Implement OAuth callback handling with token exchange and user profile fetching
- Enhance selection controls for Arrow, Circle, Line, and Rectangle shapes
- Enhance selection controls for Arrow, Circle, Line, and Rectangle shapes
- Implement shared scene loading with encryption and error handling
- Implement shared scene loading with encryption and error handling
- Integrate authentication state in Home, Header, and AppMenu components
- Integrate authentication state in Home, Header, and AppMenu components
- Implement OAuth authentication flow with session management and user state handling
- Implement OAuth authentication flow with session management and user state handling
- Add authentication and session management routes with OAuth integration
- Add authentication and session management routes with OAuth integration
- Implement RoomDurableObject for real-time collaboration and add REST API for scene management
- Implement RoomDurableObject for real-time collaboration and add REST API for scene management
- Add multi-selection frame actions and UI component
- Add multi-selection frame actions and UI component
- Add Sign In button to AppMenu with hover effect
- Implement session management and E2E encryption; add shareable link functionality and workspace name generation
- Enhance header and menu components for zen mode support; add tool lock functionality in toolbar
- Implement view and zen modes with corresponding UI adjustments and keyboard shortcuts
- Add Export Image functionality with modal and keyboard shortcuts support
- Enhance AppMenu and CommandPalette with action support and improved command handling
- Add Command Palette and Help Modal with keyboard shortcuts support
- **Line**: Support dashed and dotted lines with plain SVG rendering
- **MermaidFlowchartRenderer**: Add fill, stroke, and strokeWidth properties to node rendering
- **AIModal**: Add side-by-side live preview for Mermaid diagrams with error handling
- **AIModal**: Enhance Mermaid diagram support with unified parser and renderer feat(FrameSidebar): Update frame type detection for AI editing feat(AIRenderer): Implement lazy-loading for sequence diagram rendering feat(MermaidSequenceParser): Add parser for Mermaid sequence diagrams feat(MermaidSequenceRenderer): Create renderer for high-quality SVG sequence diagrams
- **AIModal**: Refactor header and improve layout for better usability
- **graph-engine**: Implement Graph Engine for rendering mathematical graphs
- add invisible backdrop to close menu on outside click
- add keyboard shortcuts for deleting selected shapes and cleanup attachments
- add grid functionality with toggle and keyboard shortcut support
- implement eraser trail cleanup on tool switch and improve trail rendering
- add custom cursor for laser tool

### Fixes
- update version to 4.2.3 and correct author information in package.json
- update import paths for engine modules in route.js and MarkdownRenderer.jsx
fixed image rendeinf in frame and standalone in the image based blogs and also fixed the issue of the cured arrows not showing up
fixed the blog and the image rendering urls
fixing the load from localstorage interactivty in the canvas
fixed the errors of isNearAnchor
fixed the modal for the image generation with mode details
fixed the image edit and other image generation factors
fixed the deploy.sh to ignore the git version
fixed the deploy.sh to ignore the git version
- update image source picker text and remove auto-open file picker logic
- remove unnecessary closing brace in useAutoSave function
- remove unnecessary closing brace in useAutoSave function
- enhance destroy method to properly handle contained shapes in diagram frames
- enhance destroy method to properly handle contained shapes in diagram frames
- correct spelling of InkFlowa to InkFlow in landing page
- correct spelling of InkFlowa to InkFlow in landing page
- update used workspaces calculation in UsageBar component
- update used workspaces calculation in UsageBar component
- update secrets upload command to include both Worker and Pages, and improve usage documentation
- update secrets upload command to include both Worker and Pages, and improve usage documentation
- update button labels in SaveModal for clarity and consistency
- update button labels in SaveModal for clarity and consistency
- update SITE_DESCRIPTION to remove reference to Eraser.io
- update SITE_DESCRIPTION to remove reference to Eraser.io
- update deploy script to use sudo for wrangler commands and remove unnecessary cleanup step
- update deploy script to use sudo for wrangler commands and remove unnecessary cleanup step
- update next dependency version to 15.5.2 for security improvements
- update next dependency version to 15.5.2 for security improvements
- Prevent menu closing when clicking on preferences submenu
- Prevent menu closing when clicking on preferences submenu
- Update serializer method calls to use new save and load functions
- Update serializer method calls to use new save and load functions
- Optimize session ID URL handling to preserve query parameters and hash
- Optimize session ID URL handling to preserve query parameters and hash
- Update OAuth login to use environment variable for clientId and redirectUri
- Update OAuth login to use environment variable for clientId and redirectUri
- Update WORKER_URL and clientId to use environment variables for OAuth flow
- Update WORKER_URL and clientId to use environment variables for OAuth flow
- Update database commands in package.json for consistency
- Update database commands in package.json for consistency
- Add 'plans/' directory to .gitignore
- Add 'plans/' directory to .gitignore
- Limit AppMenu height and enable scrolling for long content
- Limit AppMenu height and enable scrolling for long content
- update laser tool cursor SVG for improved visibility and styling
fixed the text tool to show propety pannel
fixed the selection recangle to of the circle and rectangle
fixed memory leak and the big were the element checks cache for the regeneration
fixed the anchor of the line from disappering
fixed rectangles, text inside frames and text box zoom adjustment , fixed system prompt for word spacng and the coordinate mismatcj
fixed the stray selectionrectangle being persistent and the texttool bug fixes, frame tool text based interaction
fixed the bugs of the frame and the selection of the frame and updated the shortcut of ctrl  + a
fixed rendering issue and applied direct parser for mermaid
fixed the tool deselection and zoom feature
fixed the ndefined reference and the imports + arrow styles of arrow
fixed the eraser being non functional
fixed the fill style icons
fixed the canvas interaction issue
fixing undefined global variables
fixed icons ont he toolbar
fixed interception of the ctrl + scrol
fixed the syntax error for }
fixed the constnt declaration errro
fixed all the dir level imports at the ./ for all the .js files
fixed the ctrl + s trigger on the save dialogue box
fixed the eraser deselect all mechanism
fixed the look of the canvastoolbar
fixed the eraser trail cause of the zoom and the mouse over and also the selection with the event listerners
fixed the multi select issue where clikcing on one of the shapes will deselect the other
fixed the line bending and the beizer curvature working
fixed the logic of detecting lists inside of table
fixed the problem of adding the texts and editing them
fixed some bugs regarding the h1 tags and the inline items + the code block creation
fixed the bugs of the code block
fixed the issue of code new lines and in lines
fixed the textbox overflowing from the edge of the screens
fixed the icon resize and the rotate and drag of icons
fixed the rotation of the icon and the resize logic to work properly
fixed the viewbox error of the rendered icons
fixed the line to have the better anchors and have a center anchor to bend the line
fixed the zoom level pan adjustment for the transform of the circle
fixed the issue of the option styles for the circle in case of undo redo
fixed the redo and the undo logic for transform in the circle
fixed the code to select the circle while clicking it
fixed residual errors about the undo and redo
fixed the issue of the viewbox zoom

### Other
- renamed the package to use elixpo/lixsearch for npm
- Add source map for engine.bundle.js to improve debugging capabilities
- Remove dependency on @lixsketch/engine from vscode package.json
- Refactor code structure for improved readability and maintainability
- Refactor code structure for improved readability and maintainability
- deploy: v5.2.12
- added zindex control on the lixscript texts
- updated and fixed the bog section and made deploy.sh push t github too
- made a deployment
- added an image pipeline blog


## v4.5.4 (2026-03-21)

### Features
- rename package references from @lixsketch to @elixpo/lixsketch and add LICENSE file
- update package name in package.json and modify .gitignore to include *.vsix
- update package script to exclude dependencies during packaging
- update .vscodeignore to include necessary files for packaging
- add icon.png for LixSketch VS Code extension
- add README.md for LixSketch VS Code extension with usage instructions and features
- add LICENSE file with MIT License terms
- add engine package launch blog post and update navigation links
- add LixSketch VS Code extension with custom editor and toolbar
- enhance SketchEngine with event handling and public API surfaces
- add keybinds (G/U) to image source picker and fix positioning
- add Research Paper tab to AI modal for publication-quality architecture diagrams
- wire shading, label styling, and frame imageURL through AIRenderer and LixScript parser
- massively improve AI system prompts with granular controls and research paper mode
- add image-in-frame via URL support
- add gradient shading support to Rectangle and Circle shapes
- add padded background behind text labels in Rectangle and Circle shapes
- implement quick save functionality with cloud sync and update shortcut descriptions
- implement quick save functionality with cloud sync and update shortcut descriptions
- enhance save status handling with immediate local marking after cloud sync
- enhance save status handling with immediate local marking after cloud sync
- implement user kick functionality and handle notifications for kicked users
- implement user kick functionality and handle notifications for kicked users
- add Canvas Properties modal and integrate save status indicator
- add Canvas Properties modal and integrate save status indicator
- implement save status indicator and enhance auto-save functionality
- implement save status indicator and enhance auto-save functionality
- add InkFlowa v1 showcase section with enhanced visuals and links
- add InkFlowa v1 showcase section with enhanced visuals and links
- update star history section to use timeline for improved visualization
- update star history section to use timeline for improved visualization
- update star history section with responsive image support
- update star history section with responsive image support
- revamp README for clarity and enhanced presentation of features
- revamp README for clarity and enhanced presentation of features
- update deploy script to support multiple command chaining
- update deploy script to support multiple command chaining
- improve workspace handling in auto-save and session ID management
- improve workspace handling in auto-save and session ID management
- enhance session ID management for new workspaces and clean URL handling
- enhance session ID management for new workspaces and clean URL handling
- remove unused router and authentication logic from LandingPage component
- remove unused router and authentication logic from LandingPage component
- refine session ID extraction logic to exclude 'new' segment in URL
- refine session ID extraction logic to exclude 'new' segment in URL
- disable legacy category and search listeners in iconTool for React integration
- disable legacy category and search listeners in iconTool for React integration
- update IconCell styles for improved layout and responsiveness in IconSidebar
- update IconCell styles for improved layout and responsiveness in IconSidebar
- enhance IconSidebar grid layout for better icon display and improve event handling in EventDispatcher and Selection modules
- enhance IconSidebar grid layout for better icon display and improve event handling in EventDispatcher and Selection modules
- update IconSidebar grid layout for improved icon display and adjust icon tool behavior to maintain tool state after placing icons
- update IconSidebar grid layout for improved icon display and adjust icon tool behavior to maintain tool state after placing icons
- enhance HelpModal and Toolbar layout, improve event handling in SketchEngine and EventDispatcher
- enhance HelpModal and Toolbar layout, improve event handling in SketchEngine and EventDispatcher
- update icon layout to use a responsive grid for better display
- update icon layout to use a responsive grid for better display
- add FindBar component and integrate find functionality in canvas and keyboard shortcuts
- add FindBar component and integrate find functionality in canvas and keyboard shortcuts
- improve frame shape handling during serialization and restoration
- improve frame shape handling during serialization and restoration
- enhance shape serialization with fill style, color, grid size, and color options
- enhance shape serialization with fill style, color, grid size, and color options
- add fill style and color options to Frame component
- add fill style and color options to Frame component
- implement context menu for canvas with copy, paste, and shape actions
- implement context menu for canvas with copy, paste, and shape actions
- enhance removeSelection method to clear selection outlines and anchors
- enhance removeSelection method to clear selection outlines and anchors
- enhance authentication flow and improve user experience with session management
- enhance authentication flow and improve user experience with session management
- add AI request limits and usage overview to profile page
- add AI request limits and usage overview to profile page
- implement AI usage tracking and quota management for users and guests
- implement AI usage tracking and quota management for users and guests
- implement workspace limits and tracking for user and guest sessions
- implement workspace limits and tracking for user and guest sessions
- enforce room limit to one per user for better resource management
- enforce room limit to one per user for better resource management
- add auto-open file picker for image tool activation
- add auto-open file picker for image tool activation
- improve IconCell button accessibility and optimize icon fetching logic
- improve IconCell button accessibility and optimize icon fetching logic
- refactor resizing logic for Frame, Rectangle, Icon, and Image tools to improve rotation handling and maintain aspect ratio
- refactor resizing logic for Frame, Rectangle, Icon, and Image tools to improve rotation handling and maintain aspect ratio
- enhance pricing page visuals with improved dot grid opacity, margin doodle colors, and ambient glow effects
- enhance pricing page visuals with improved dot grid opacity, margin doodle colors, and ambient glow effects
- enhance pricing page with animated price display, ambient glow effects, and margin doodles; improve UI responsiveness and visual appeal
- enhance pricing page with animated price display, ambient glow effects, and margin doodles; improve UI responsiveness and visual appeal
- implement pricing page with plan details, toggle for monthly/annual billing, and enhanced UI components
- implement pricing page with plan details, toggle for monthly/annual billing, and enhanced UI components
- enhance SaveModal with export options for PNG, SVG, and PDF; improve preview generation and UI layout
- enhance SaveModal with export options for PNG, SVG, and PDF; improve preview generation and UI layout
- enhance deploy script with D1 and KV binding IDs for Cloudflare Pages deployment
- enhance deploy script with D1 and KV binding IDs for Cloudflare Pages deployment
- implement scene deletion API endpoint and integrate with SaveModal for revoking shared links
- implement scene deletion API endpoint and integrate with SaveModal for revoking shared links
- implement RoadmapPage with timeline sections for shipped, in-progress, and planned features, including interactive elements and visual enhancements
- implement RoadmapPage with timeline sections for shipped, in-progress, and planned features, including interactive elements and visual enhancements
- enhance RoughLixScriptCanvas with label background cutout effect and refactor label drawing logic + custom scrollbar for the global css
- enhance RoughLixScriptCanvas with label background cutout effect and refactor label drawing logic + custom scrollbar for the global css
- add RoughLixScriptCanvas component for enhanced LixScript rendering and update LixScriptParser to export resolveShapeRefs function
- add RoughLixScriptCanvas component for enhanced LixScript rendering and update LixScriptParser to export resolveShapeRefs function
- implement CommunityPage with interactive elements and Markdown content
- implement CommunityPage with interactive elements and Markdown content
- Replace Coming Soon pages with CanvasPageLayout for Use Cases, Roadmap, and Teams
- Replace Coming Soon pages with CanvasPageLayout for Use Cases, Roadmap, and Teams
- enhance BlogPostPage and MarkdownRenderer with RoughJS elements for improved visual styling
- enhance BlogPostPage and MarkdownRenderer with RoughJS elements for improved visual styling
- implement WebGL particle constellation and enhance animation effects on landing page
- implement WebGL particle constellation and enhance animation effects on landing page
- refactor environment variable handling for collaboration and worker URLs
- refactor environment variable handling for collaboration and worker URLs
- add 'edge' runtime export to multiple API routes and layouts
- add 'edge' runtime export to multiple API routes and layouts
- add logo click functionality to reload or navigate to home
- add logo click functionality to reload or navigate to home
- enhance BlogPostPage and MarkdownRenderer with improved styling and functionality
- enhance BlogPostPage and MarkdownRenderer with improved styling and functionality
- enhance documentation and UI components
- enhance documentation and UI components
- Implement Coming Soon pages for Pricing, Blog, Community, How to Start, Security, Use Cases, and Roadmap
- Implement Coming Soon pages for Pricing, Blog, Community, How to Start, Security, Use Cases, and Roadmap
- add framer-motion for animations and update package dependencies
- add framer-motion for animations and update package dependencies
- Implement auto-save functionality and enhance AppMenu and HelpModal with documentation links
- Implement auto-save functionality and enhance AppMenu and HelpModal with documentation links
- Update LixScript specifications and examples for improved clarity and consistency
- Update LixScript specifications and examples for improved clarity and consistency
- Enhance LixScript LLM specification and improve diagram generation instructions
- Enhance LixScript LLM specification and improve diagram generation instructions
- Update LixScript LLM model and enhance specification details
- Update LixScript LLM model and enhance specification details
- Add LixScript documentation page and LLM specification
- Add LixScript documentation page and LLM specification
- implement deploy script for Cloudflare Worker with upload, build, and migration commands
- implement deploy script for Cloudflare Worker with upload, build, and migration commands
- add LixScriptParser for parsing and rendering LixScript diagrams
- add LixScriptParser for parsing and rendering LixScript diagrams
- **api**: add image signing and scene management endpoints
- **api**: add image signing and scene management endpoints
- Implement collaboration feature with WebSocket support and user presence tracking
- Implement collaboration feature with WebSocket support and user presence tracking
- Add live collaboration feature with shareable link and error handling
- Add live collaboration feature with shareable link and error handling
- Refactor OAuth callback handling and improve error logging
- Refactor OAuth callback handling and improve error logging
- Update workspace name handling to initialize from localStorage and allow empty names
- Update workspace name handling to initialize from localStorage and allow empty names
- Add workspace name parameter to room initialization and database insertion
- Add workspace name parameter to room initialization and database insertion
- Implement OAuth callback handling with token exchange and user profile fetching
- Implement OAuth callback handling with token exchange and user profile fetching
- Enhance selection controls for Arrow, Circle, Line, and Rectangle shapes
- Enhance selection controls for Arrow, Circle, Line, and Rectangle shapes
- Implement shared scene loading with encryption and error handling
- Implement shared scene loading with encryption and error handling
- Integrate authentication state in Home, Header, and AppMenu components
- Integrate authentication state in Home, Header, and AppMenu components
- Implement OAuth authentication flow with session management and user state handling
- Implement OAuth authentication flow with session management and user state handling
- Add authentication and session management routes with OAuth integration
- Add authentication and session management routes with OAuth integration
- Implement RoomDurableObject for real-time collaboration and add REST API for scene management
- Implement RoomDurableObject for real-time collaboration and add REST API for scene management
- Add multi-selection frame actions and UI component
- Add multi-selection frame actions and UI component
- Add Sign In button to AppMenu with hover effect
- Implement session management and E2E encryption; add shareable link functionality and workspace name generation
- Enhance header and menu components for zen mode support; add tool lock functionality in toolbar
- Implement view and zen modes with corresponding UI adjustments and keyboard shortcuts
- Add Export Image functionality with modal and keyboard shortcuts support
- Enhance AppMenu and CommandPalette with action support and improved command handling
- Add Command Palette and Help Modal with keyboard shortcuts support
- **Line**: Support dashed and dotted lines with plain SVG rendering
- **MermaidFlowchartRenderer**: Add fill, stroke, and strokeWidth properties to node rendering
- **AIModal**: Add side-by-side live preview for Mermaid diagrams with error handling
- **AIModal**: Enhance Mermaid diagram support with unified parser and renderer feat(FrameSidebar): Update frame type detection for AI editing feat(AIRenderer): Implement lazy-loading for sequence diagram rendering feat(MermaidSequenceParser): Add parser for Mermaid sequence diagrams feat(MermaidSequenceRenderer): Create renderer for high-quality SVG sequence diagrams
- **AIModal**: Refactor header and improve layout for better usability
- **graph-engine**: Implement Graph Engine for rendering mathematical graphs
- add invisible backdrop to close menu on outside click
- add keyboard shortcuts for deleting selected shapes and cleanup attachments
- add grid functionality with toggle and keyboard shortcut support
- implement eraser trail cleanup on tool switch and improve trail rendering
- add custom cursor for laser tool

### Fixes
- update version to 4.2.3 and correct author information in package.json
- update import paths for engine modules in route.js and MarkdownRenderer.jsx
fixed image rendeinf in frame and standalone in the image based blogs and also fixed the issue of the cured arrows not showing up
fixed the blog and the image rendering urls
fixing the load from localstorage interactivty in the canvas
fixed the errors of isNearAnchor
fixed the modal for the image generation with mode details
fixed the image edit and other image generation factors
fixed the deploy.sh to ignore the git version
fixed the deploy.sh to ignore the git version
- update image source picker text and remove auto-open file picker logic
- remove unnecessary closing brace in useAutoSave function
- remove unnecessary closing brace in useAutoSave function
- enhance destroy method to properly handle contained shapes in diagram frames
- enhance destroy method to properly handle contained shapes in diagram frames
- correct spelling of InkFlowa to InkFlow in landing page
- correct spelling of InkFlowa to InkFlow in landing page
- update used workspaces calculation in UsageBar component
- update used workspaces calculation in UsageBar component
- update secrets upload command to include both Worker and Pages, and improve usage documentation
- update secrets upload command to include both Worker and Pages, and improve usage documentation
- update button labels in SaveModal for clarity and consistency
- update button labels in SaveModal for clarity and consistency
- update SITE_DESCRIPTION to remove reference to Eraser.io
- update SITE_DESCRIPTION to remove reference to Eraser.io
- update deploy script to use sudo for wrangler commands and remove unnecessary cleanup step
- update deploy script to use sudo for wrangler commands and remove unnecessary cleanup step
- update next dependency version to 15.5.2 for security improvements
- update next dependency version to 15.5.2 for security improvements
- Prevent menu closing when clicking on preferences submenu
- Prevent menu closing when clicking on preferences submenu
- Update serializer method calls to use new save and load functions
- Update serializer method calls to use new save and load functions
- Optimize session ID URL handling to preserve query parameters and hash
- Optimize session ID URL handling to preserve query parameters and hash
- Update OAuth login to use environment variable for clientId and redirectUri
- Update OAuth login to use environment variable for clientId and redirectUri
- Update WORKER_URL and clientId to use environment variables for OAuth flow
- Update WORKER_URL and clientId to use environment variables for OAuth flow
- Update database commands in package.json for consistency
- Update database commands in package.json for consistency
- Add 'plans/' directory to .gitignore
- Add 'plans/' directory to .gitignore
- Limit AppMenu height and enable scrolling for long content
- Limit AppMenu height and enable scrolling for long content
- update laser tool cursor SVG for improved visibility and styling
fixed the text tool to show propety pannel
fixed the selection recangle to of the circle and rectangle
fixed memory leak and the big were the element checks cache for the regeneration
fixed the anchor of the line from disappering
fixed rectangles, text inside frames and text box zoom adjustment , fixed system prompt for word spacng and the coordinate mismatcj
fixed the stray selectionrectangle being persistent and the texttool bug fixes, frame tool text based interaction
fixed the bugs of the frame and the selection of the frame and updated the shortcut of ctrl  + a
fixed rendering issue and applied direct parser for mermaid
fixed the tool deselection and zoom feature
fixed the ndefined reference and the imports + arrow styles of arrow
fixed the eraser being non functional
fixed the fill style icons
fixed the canvas interaction issue
fixing undefined global variables
fixed icons ont he toolbar
fixed interception of the ctrl + scrol
fixed the syntax error for }
fixed the constnt declaration errro
fixed all the dir level imports at the ./ for all the .js files
fixed the ctrl + s trigger on the save dialogue box
fixed the eraser deselect all mechanism
fixed the look of the canvastoolbar
fixed the eraser trail cause of the zoom and the mouse over and also the selection with the event listerners
fixed the multi select issue where clikcing on one of the shapes will deselect the other
fixed the line bending and the beizer curvature working
fixed the logic of detecting lists inside of table
fixed the problem of adding the texts and editing them
fixed some bugs regarding the h1 tags and the inline items + the code block creation
fixed the bugs of the code block
fixed the issue of code new lines and in lines
fixed the textbox overflowing from the edge of the screens
fixed the icon resize and the rotate and drag of icons
fixed the rotation of the icon and the resize logic to work properly
fixed the viewbox error of the rendered icons
fixed the line to have the better anchors and have a center anchor to bend the line
fixed the zoom level pan adjustment for the transform of the circle
fixed the issue of the option styles for the circle in case of undo redo
fixed the redo and the undo logic for transform in the circle
fixed the code to select the circle while clicking it
fixed residual errors about the undo and redo
fixed the issue of the viewbox zoom

### Other
- renamed the package to use elixpo/lixsearch for npm
- Add source map for engine.bundle.js to improve debugging capabilities
- Remove dependency on @lixsketch/engine from vscode package.json
- Refactor code structure for improved readability and maintainability
- Refactor code structure for improved readability and maintainability
- deploy: v5.2.12
- added zindex control on the lixscript texts
- updated and fixed the bog section and made deploy.sh push t github too
- made a deployment
- added an image pipeline blog

