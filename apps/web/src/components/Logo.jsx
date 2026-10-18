import React from 'react';

const Logo = ({ size = 'md', className = '' }) => {
    const sizes = {
        sm: 'h-8',
        md: 'h-12',
        lg: 'h-16',
        xl: 'h-20',
    };

    return (
        <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="Onatex - Garment Manufacturer"
            className={`${sizes[size]} object-contain ${className}`}
        />
    );
};

export default Logo;
