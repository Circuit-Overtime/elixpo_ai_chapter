document.addEventListener('DOMContentLoaded', function () {
    // Mobile menu toggle
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navbar = document.querySelector('.navbar');

    mobileMenuBtn.addEventListener('click', function () {
        navbar.classList.toggle('mobile-menu-active');
    });

    // Close mobile menu when clicking outside
    document.addEventListener('click', function (event) {
        if (!navbar.contains(event.target) && navbar.classList.contains('mobile-menu-active')) {
            navbar.classList.remove('mobile-menu-active');
        }
    });

    // Dropdown hover effect for desktop
    const dropdowns = document.querySelectorAll('.dropdown');

    dropdowns.forEach(dropdown => {
        dropdown.addEventListener('mouseenter', function () {
            if (window.innerWidth > 768) {
                const dropdownContent = this.querySelector('.dropdown-content');
                dropdownContent.style.display = 'block';
                setTimeout(() => {
                    dropdownContent.style.opacity = '1';
                }, 10);
            }
        });

        dropdown.addEventListener('mouseleave', function () {
            if (window.innerWidth > 768) {
                const dropdownContent = this.querySelector('.dropdown-content');
                dropdownContent.style.opacity = '0';
                setTimeout(() => {
                    dropdownContent.style.display = 'none';
                }, 300);
            }
        });

        // For mobile - toggle dropdown on click
        dropdown.addEventListener('click', function (e) {
            if (window.innerWidth <= 768) {
                e.preventDefault();
                const dropdownContent = this.querySelector('.dropdown-content');
                if (dropdownContent.style.display === 'block') {
                    dropdownContent.style.opacity = '0';
                    setTimeout(() => {
                        dropdownContent.style.display = 'none';
                    }, 300);
                } else {
                    dropdownContent.style.display = 'block';
                    setTimeout(() => {
                        dropdownContent.style.opacity = '1';
                    }, 10);
                }
            }
        });
    });
   
     });

   