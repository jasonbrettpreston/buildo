// @ts-nocheck
// Gate C clean twin (task-367): the allowed forms. lucide-react-native is a different package from lucide-react (Spec 90 names lucide-react).
import { View, FlatList } from 'react-native';
import { Image } from 'expo-image';
import { Search } from 'lucide-react-native';
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
export function Good({ data }) {
  const q = useQuery({ queryKey: ['x'], queryFn: () => fetch('/api/x') });
  const renderItem = useCallback(({ item }) => <View>{item}</View>, []);
  const document = { id: 1 };
  return (
    <View>
      <Search />
      <FlatList data={data} renderItem={renderItem} />
      <Image source={{ uri: 'https://example.com/a.png' }} />
    </View>
  );
}
