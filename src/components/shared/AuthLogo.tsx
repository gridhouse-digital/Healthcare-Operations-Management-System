import logoForDarkSurface from '@/assets/logo-light.png';
import logoForLightSurface from '@/assets/logo-dark.png';

/* The auth pages' logo, from the project's own files, matched to the theme the way the header does it */
export function AuthLogo() {
    return (
        <>
            <img src={logoForLightSurface} alt="HOMS" className="mx-auto mb-5 block h-10 w-auto object-contain dark:hidden" />
            <img src={logoForDarkSurface} alt="HOMS" className="mx-auto mb-5 hidden h-10 w-auto object-contain dark:block" />
        </>
    );
}
