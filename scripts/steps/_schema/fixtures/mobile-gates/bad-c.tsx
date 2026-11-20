// @ts-nocheck
// Gate C planted defects (task-367): one per Spec 90 section 5 line.
import { Image, FlatList } from 'react-native';
import { motion } from 'framer-motion';
import { useEffect } from 'react';
export function Bad({ data }) {
  useEffect(() => { fetch('/api/x'); }, []);
  const w = window.innerWidth;
  const s = localStorage.getItem('k');
  navigator.geolocation.getCurrentPosition(() => {});
  return (
    <div>
      <FlatList data={data} renderItem={({ item }) => <span>{item}</span>} />
      <Image source={{ uri: 'https://example.com/a.png' }} />
    </div>
  );
}
