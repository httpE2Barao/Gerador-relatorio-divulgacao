'use client';

import { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { saveCover, getCover, clearCover, saveProof, getAllProofs, deleteProof, clearAllProofs } from '@/lib/indexedDB';

interface ImageItem {
  id: string;
  fileBlob: Blob;
  previewBase64: string;
  title: string;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function HomePage() {
  const [projectTitle, setProjectTitle] = useState('');
  const [sponsor, setSponsor] = useState('');

  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');

  const [items, setItems] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(false);

  const getPreviewUrl = (base64: string): string => {
    return base64;
  };

  useEffect(() => {
    async function loadFromDB() {
      try {
        const savedCover = await getCover();
        if (savedCover) {
          setProjectTitle(savedCover.projectTitle);
          setSponsor(savedCover.sponsor);
          setCoverPreview(savedCover.previewBase64);
          setCoverImage(new File([savedCover.fileBlob], 'cover.jpg', { type: 'image/jpeg' }));
        }
      } catch (e) {
        console.error('Erro ao carregar capa do IndexedDB:', e);
      }

      try {
        const savedProofs = await getAllProofs();

        if (savedProofs.length > 0) {
          const restoredItems = savedProofs.map((proof) => ({
            id: proof.id,
            fileBlob: proof.fileBlob,
            previewBase64: proof.previewBase64,
            title: proof.title,
          }));
          setItems(restoredItems);
        }
      } catch (e) {
        console.error('Erro ao carregar do IndexedDB:', e);
      }
    }

    loadFromDB();
  }, []);

  const processFile = async (file: File): Promise<File> => {
    const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic');

    if (isHeic) {
      setLoading(true);
      try {
        const heic2any = (await import('heic2any')).default;

        const convertedBlob = await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.9,
        }) as Blob;

        const newFileName = file.name.replace(/\.[^/.]+$/, "") + ".jpeg";
        const convertedFile = new File([convertedBlob], newFileName, { type: 'image/jpeg' });
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

      const base64 = await blobToBase64(processedFile);

      await saveCover({
        id: 'cover',
        projectTitle,
        sponsor,
        fileBlob: processedFile,
        previewBase64: base64,
      });

      setCoverImage(processedFile);
      setCoverPreview(base64);
    }
  };

  const handleProofImagesChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setLoading(true);
      try {
        const processedFiles = await Promise.all(
          Array.from(e.target.files).map(file => processFile(file))
        );

        for (const file of processedFiles) {
          const id = Math.random().toString(36).substr(2, 9);
          const previewBase64 = await blobToBase64(file);

          await saveProof({
            id,
            fileBlob: file,
            previewBase64,
            title: '',
          });

          setItems(prevItems => [...prevItems, {
            id,
            fileBlob: file,
            previewBase64,
            title: '',
          }]);
        }
      } catch (e) {
        console.error('Erro ao processar imagens:', e);
      } finally {
        setLoading(false);
      }
    }
    e.target.value = '';
  };

  useEffect(() => {
    async function updateCover() {
      if (coverPreview) {
        await saveCover({
          id: 'cover',
          projectTitle,
          sponsor,
          fileBlob: coverImage!,
          previewBase64: coverPreview,
        });
      }
    }
    if (coverImage || coverPreview) {
      updateCover();
    }
  }, [projectTitle, sponsor, coverImage]);

  const handleTitleChange = async (index: number, newTitle: string) => {
    const updatedItems = [...items];
    updatedItems[index].title = newTitle;
    setItems(updatedItems);

    const item = updatedItems[index];
    await saveProof({
      id: item.id,
      fileBlob: item.fileBlob,
      previewBase64: item.previewBase64,
      title: newTitle,
    });
  };

  const handleDeleteItem = async (index: number) => {
    const item = items[index];
    await deleteProof(item.id);
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

    items.forEach((item) => {
      const file = new File([item.fileBlob], `proof-${item.id}.jpg`, { type: 'image/jpeg' });
      formData.append('proof_files', file);
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
          try {
            const textError = await response.text();
            errorMessage = textError || errorMessage;
          } catch {
          }
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

      await clearCover();
      await clearAllProofs();
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
    <main className="container mx-auto p-4 md:p-8 text-black dark:text-white">
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
              {coverPreview && (
                <img src={getPreviewUrl(coverPreview)} alt="Preview da capa" className="mt-4 rounded-lg w-full object-contain h-32 border border-gray-200" />
              )}
            </div>
          </div>
        </div>
        <div className="mb-6">
          <h2 className="text-xl font-bold mb-2">2. Adicionar Imagens de Comprovação</h2>
          <input type="file" multiple accept="image/*" onChange={handleProofImagesChange} className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-200 file:text-black hover:file:bg-gray-300" />
        </div>
        {items.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">3. Locais das Imagens ({items.length} itens salvos)</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {items.map((item, index) => (
                <div key={item.id} className="border border-gray-300 rounded-lg relative flex flex-col">
                  <img src={getPreviewUrl(item.previewBase64)} alt={`Preview ${index}`} className="w-full h-auto object-cover rounded-t-lg" style={{ aspectRatio: '2/3' }} />
                  <div className="p-2 mt-auto">
                    <input 
                      type="text" 
                      placeholder="Local" 
                      value={item.title} 
                      onChange={(e) => handleTitleChange(index, e.target.value)} 
                      className="w-full p-1 border border-gray-400 rounded-md shadow-sm focus:border-black focus:ring-black text-sm" 
                      required 
                    />
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
        <button type="submit" disabled={loading || items.length === 0} className="w-full py-3 px-4 bg-gray-500 text-white font-semibold rounded-lg shadow-md hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed">
          {loading ? 'Gerando PDF...' : 'Gerar PDF de Comprovação'}
        </button>
      </form>
    </main>
  );
}
