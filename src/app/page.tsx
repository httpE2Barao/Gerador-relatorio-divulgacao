'use client';

import { useState, useEffect, ChangeEvent, FormEvent } from 'react';
// REMOVIDO: A importação estática abaixo causava o erro no build.
// import heic2any from 'heic2any'; 

// Interface para os itens armazenados no localStorage
interface StoredItem {
  id: string;
  preview: string;
  title: string;
}

interface ImageItem {
  id: string;
  file?: File; // Tornando opcional pois pode não estar disponível ao restaurar do localStorage
  preview: string;
  title: string;
}

export default function HomePage() {
  const [projectTitle, setProjectTitle] = useState('');
  const [sponsor, setSponsor] = useState('');

  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');

  const [items, setItems] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Carregar dados do localStorage quando o componente montar
  useEffect(() => {
    const savedProjectTitle = localStorage.getItem('projectTitle');
    const savedSponsor = localStorage.getItem('sponsor');
    const savedCoverPreview = localStorage.getItem('coverPreview');
    const savedItems = localStorage.getItem('proofItems');

    if (savedProjectTitle) setProjectTitle(savedProjectTitle);
    if (savedSponsor) setSponsor(savedSponsor);
    if (savedCoverPreview) setCoverPreview(savedCoverPreview);
    
    if (savedItems) {
      try {
        const parsedItems: StoredItem[] = JSON.parse(savedItems);
        // Como não podemos salvar arquivos no localStorage, precisamos apenas dos previews e títulos
        const restoredItems: ImageItem[] = parsedItems.map((item) => ({
          id: item.id,
          preview: item.preview,
          title: item.title
          // file: undefined - não podemos restaurar o arquivo do localStorage
        }));
        setItems(restoredItems);
      } catch (e) {
        console.error('Erro ao restaurar itens do localStorage:', e);
      }
    }
  }, []);

  // Salvar dados no localStorage sempre que houver alterações
  useEffect(() => {
    localStorage.setItem('projectTitle', projectTitle);
    localStorage.setItem('sponsor', sponsor);
    localStorage.setItem('coverPreview', coverPreview);
    
    // Salvar apenas os dados que podem ser serializados (preview e title)
    const itemsToSave: StoredItem[] = items.map(item => ({
      id: item.id,
      preview: item.preview,
      title: item.title
    }));
    localStorage.setItem('proofItems', JSON.stringify(itemsToSave));
  }, [projectTitle, sponsor, coverPreview, items]);

  const processFile = async (file: File): Promise<File> => {
    const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic');

    if (isHeic) {
      setLoading(true);
      try {
        // CORREÇÃO: A biblioteca 'heic2any' é importada dinamicamente aqui,
        // garantindo que isso só aconteça no ambiente do navegador.
        const heic2any = (await import('heic2any')).default;

        console.log('Convertendo arquivo HEIC para JPEG...');
        const convertedBlob = await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.9,
        }) as Blob;

        const newFileName = file.name.replace(/\.[^/.]+$/, "") + ".jpeg";
        const convertedFile = new File([convertedBlob], newFileName, { type: 'image/jpeg' });
        console.log('Conversão concluída.');
        return convertedFile;
      } catch (error) {
        console.error('Erro ao converter HEIC:', error);
        alert('Houve um erro ao converter a imagem HEIC. Por favor, tente uma imagem JPEG ou PNG.');
        return file;
      } finally {
        setLoading(false);
      }
    }
    return file;
  };

  const handleCoverImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const originalFile = e.target.files[0];
      const processedFile = await processFile(originalFile);

      setCoverImage(processedFile);
      setCoverPreview(URL.createObjectURL(processedFile));
    }
  };

  const handleProofImagesChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const processedFiles = await Promise.all(
        Array.from(e.target.files).map(file => processFile(file))
      );

      const newItems = processedFiles.map(file => ({
        id: Math.random().toString(36).substr(2, 9), // ID único para cada item
        file,
        preview: URL.createObjectURL(file),
        title: '',
      }));
      setItems(prevItems => [...prevItems, ...newItems]);
    }
    e.target.value = '';
  };

  const handleTitleChange = (index: number, newTitle: string) => {
    const updatedItems = [...items];
    updatedItems[index].title = newTitle;
    setItems(updatedItems);
  };

  const handleDeleteItem = (index: number) => {
    setItems(prevItems => prevItems.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!coverImage && !coverPreview) {
      alert('Por favor, adicione uma imagem de capa.');
      return;
    }
    if (items.length === 0) {
      alert('Por favor, adicione ao menos uma imagem de comprovação.');
      return;
    }
    
    // Verificar se todos os itens têm título preenchido
    const itemsWithoutTitle = items.filter(item => !item.title.trim());
    if (itemsWithoutTitle.length > 0) {
      alert('Por favor, preencha o local para todas as imagens de comprovação.');
      return;
    }
    
    setLoading(true);

    const formData = new FormData();

    formData.append('projectTitle', projectTitle);
    formData.append('sponsor', sponsor);
    if (coverImage) {
      formData.append('coverImage', coverImage);
    }

    // Contar quantos itens têm arquivo disponível (não restaurados do localStorage)
    const itemsWithFiles = items.filter(item => item.file);
    
    if (itemsWithFiles.length === 0) {
      alert('Por favor, adicione novas imagens de comprovação. As imagens restauradas do cache não podem ser reutilizadas.');
      setLoading(false);
      return;
    }

    itemsWithFiles.forEach((item) => {
      formData.append('proof_files', item.file!);
      formData.append('titles', item.title);
    });

    try {
      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = `Erro: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          const textError = await response.text();
          errorMessage = textError || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const suggestedFilename = response.headers.get('x-suggested-filename');

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = suggestedFilename || 'comprovacao.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      // Limpar dados após geração bem-sucedida do PDF
      localStorage.removeItem('projectTitle');
      localStorage.removeItem('sponsor');
      localStorage.removeItem('coverPreview');
      localStorage.removeItem('proofItems');
      setProjectTitle('');
      setSponsor('');
      setCoverImage(null);
      setCoverPreview('');
      setItems([]);

    } catch (error: unknown) {
      let errorMessage = "Ocorreu um erro desconhecido";
      if (error instanceof Error) {
        errorMessage = `Ocorreu um erro: ${error.message}`;
      }
      console.error(error);
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container mx-auto p-4 md:p-8 bg-white text-black">
      <form onSubmit={handleSubmit}>
        <div className="mb-8 p-6 border border-gray-300 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">1. Dados da Capa</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="mb-4">
                <label className="block text-base font-medium mb-1">Título do Projeto</label>
                <input type="text" value={projectTitle} onChange={e => setProjectTitle(e.target.value)} className="mt-1 block w-full p-2 border border-gray-400 rounded-md shadow-sm focus:border-black focus:ring-black" />
              </div>
              <div>
                <label className="block text-base font-medium mb-1">Patrocinador</label>
                <input type="text" value={sponsor} onChange={e => setSponsor(e.target.value)} className="mt-1 block w-full p-2 border border-gray-400 rounded-md shadow-sm focus:border-black focus:ring-black" />
              </div>
            </div>
            <div>
              <label className="block text-base font-medium mb-1">Imagem de Capa</label>
              <input type="file" accept="image/*" onChange={handleCoverImageChange} className="mt-1 block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-200 file:text-black hover:file:bg-gray-300" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {coverPreview && <img src={coverPreview} alt="Preview da capa" className="mt-4 rounded-lg w-full object-contain h-32 border border-gray-200" />}
            </div>
          </div>
        </div>
        <div className="mb-6">
          <h2 className="text-xl font-bold mb-2">2. Adicionar Imagens de Comprovação</h2>
          <input type="file" multiple accept="image/*" onChange={handleProofImagesChange} className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-200 file:text-black hover:file:bg-gray-300" />
        </div>
        {items.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">3. Locais das Imagens</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {items.map((item, index) => (
                <div key={`${item.id}`} className="border border-gray-300 rounded-lg relative flex flex-col">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.preview} alt={`Preview ${index}`} className="w-full h-auto object-cover rounded-t-lg" style={{ aspectRatio: '2/3' }} />
                  <div className="p-2 mt-auto">
                    <input type="text" placeholder="Local" value={item.title} onChange={(e) => handleTitleChange(index, e.target.value)} className="w-full p-1 border border-gray-400 rounded-md shadow-sm focus:border-black focus:ring-black text-sm" required />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(index)}
                    className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white font-bold w-6 h-6 flex items-center justify-center rounded-full text-xs"
                    aria-label="Deletar imagem"
                  >X</button>
                </div>
              ))}
            </div>
          </div>
        )}
        <button type="submit" disabled={loading || items.length === 0} className="w-full py-3 px-4 bg-black text-white font-semibold rounded-lg shadow-md hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed">
          {loading ? 'Gerando PDF...' : 'Gerar PDF de Comprovação'}
        </button>
      </form>
    </main>
  );
}