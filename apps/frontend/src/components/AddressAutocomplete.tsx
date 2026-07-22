import { useCallback, useEffect, useRef } from 'react'
import { cn } from '../lib/cn'

interface PlaceResult {
  address: string
  lat: number
  lng: number
}

interface GooglePlace {
  name?: string
  formatted_address?: string
  geometry?: {
    location?: {
      lat(): number
      lng(): number
    }
  }
}

interface GoogleAutocompleteInstance {
  addListener: (event: string, handler: () => void) => void
  getPlace: () => GooglePlace
}

interface Props {
  value: string
  onChange: (value: string) => void
  onPlaceSelect: (place: PlaceResult) => void
  placeholder?: string
  apiKey: string | null
  className?: string
  required?: boolean
  id?: string
}

declare global {
  interface Window {
    google?: {
      maps?: {
        places?: {
          Autocomplete: new (
            input: HTMLInputElement,
            options?: { types?: string[]; componentRestrictions?: { country: string }; fields?: string[] },
          ) => GoogleAutocompleteInstance
        }
      }
    }
    __mapsLoaded?: boolean
  }
}

export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder,
  apiKey,
  className,
  required,
  id,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<GoogleAutocompleteInstance | null>(null)

  // Keep the DOM input in sync when value is set externally (e.g. form reset)
  // but don't fight Google Places which writes to the DOM directly.
  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value
    }
  }, [value])

  const initAutocomplete = useCallback(() => {
    if (!inputRef.current || !window.google?.maps?.places || autocompleteRef.current) return

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'gh' },
      fields: ['formatted_address', 'geometry', 'name'],
    })

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()
      if (!place.formatted_address) return

      // Include business/place name so rider knows exact location
      // e.g. "Eat Healthy Organic Vegetables, Oyarifa Road, Oyarifa, Ghana"
      const fullAddress = place.name && !place.formatted_address.includes(place.name)
        ? `${place.name}, ${place.formatted_address}`
        : place.formatted_address

      onChange(fullAddress)

      if (!place.geometry?.location) return
      onPlaceSelect({
        address: fullAddress,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      })
    })

    autocompleteRef.current = autocomplete
  }, [onChange, onPlaceSelect])

  useEffect(() => {
    if (!apiKey) return

    if (window.google?.maps?.places) {
      initAutocomplete()
      return
    }

    if (!window.__mapsLoaded) {
      window.__mapsLoaded = true
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
      script.async = true
      script.onload = initAutocomplete
      document.head.appendChild(script)
      return
    }

    const intervalId = window.setInterval(() => {
      if (!window.google?.maps?.places) return
      window.clearInterval(intervalId)
      initAutocomplete()
    }, 200)

    return () => window.clearInterval(intervalId)
  }, [apiKey, initAutocomplete])

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      // Use defaultValue (uncontrolled) so Google Places can write to the DOM freely.
      // We sync externally via the useEffect above.
      defaultValue={value}
      onChange={event => onChange(event.target.value)}
      placeholder={placeholder}
      required={required}
      className={cn('input', className)}
      autoComplete="off"
    />
  )
}
